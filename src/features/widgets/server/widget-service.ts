import {
  compareWidgets,
  positionBetween,
  WIDGET_LIMITS,
  widgetPatchSchemas,
  type CreateWidgetInput,
  type Widget,
  type WidgetPatch,
} from "../domain/widget";
import type { ImageStore } from "./image-store";
import {
  ParentPodNotFoundError,
  WidgetLimitReachedError,
  WidgetNotFoundError,
  WidgetValidationError,
} from "./widget-errors";
import type { WidgetRepository } from "./widget-repository";

/** What widgets need to know about pods, supplied by the composition root. */
export interface PodLookupPort {
  exists(podId: string): Promise<boolean>;
  /** Called after any content change so the pod's "last edited" stays accurate. */
  touch(podId: string): Promise<void>;
}

export type WidgetServiceDeps = {
  repository: WidgetRepository;
  images: ImageStore;
  pods: PodLookupPort;
  clock?: () => Date;
  newId?: () => string;
  maxWidgetsPerPod?: number;
};

export type CreateWidgetResult = { widget: Widget; created: boolean };

/** Business rules for widgets. Framework-agnostic: no HTTP or Next.js here. */
export function createWidgetService({
  repository,
  images,
  pods,
  clock = () => new Date(),
  newId = () => crypto.randomUUID(),
  maxWidgetsPerPod = WIDGET_LIMITS.maxWidgetsPerPod,
}: WidgetServiceDeps) {
  async function list(podId: string): Promise<Widget[]> {
    return (await repository.list(podId)).sort(compareWidgets);
  }

  async function deleteImageIfReplaced(previous: Widget, next: Widget) {
    if (previous.type !== "image" || !previous.imageId) return;
    if (next.type === "image" && next.imageId === previous.imageId) return;
    await images.delete(previous.imageId);
  }

  return {
    list,

    /**
     * Idempotent create keyed by a client-generated id: retrying the same
     * request returns the existing widget instead of creating a duplicate.
     */
    async create(
      podId: string,
      widgetId: string,
      input: CreateWidgetInput,
    ): Promise<CreateWidgetResult> {
      if (!(await pods.exists(podId))) throw new ParentPodNotFoundError(podId);

      const existing = await repository.get(podId, widgetId);
      if (existing) return { widget: existing, created: false };

      const now = clock().toISOString();
      const position =
        input.position ?? positionBetween((await list(podId)).at(-1)?.position ?? null, null);
      const base = { id: widgetId, position, createdAt: now, updatedAt: now };
      const widget: Widget =
        input.type === "text"
          ? { ...base, type: "text", content: input.content }
          : {
              ...base,
              type: "image",
              imageId: input.imageId,
              alt: input.alt,
              caption: input.caption,
            };

      const result = await repository.insertIfAbsent(podId, widget, {
        maxWidgets: maxWidgetsPerPod,
      });
      if (result === "limit_reached") throw new WidgetLimitReachedError(maxWidgetsPerPod);
      if (result === "exists") {
        const raced = await repository.get(podId, widgetId);
        if (!raced) throw new WidgetNotFoundError(widgetId); // deleted concurrently
        return { widget: raced, created: false };
      }
      await pods.touch(podId);
      return { widget, created: true };
    },

    /**
     * Applies a partial update, validated against the widget's own type
     * (a text widget cannot receive an image's `alt`, and so on).
     */
    async update(podId: string, widgetId: string, rawPatch: unknown): Promise<Widget> {
      const existing = await repository.get(podId, widgetId);
      if (!existing) throw new WidgetNotFoundError(widgetId);

      const parsed = widgetPatchSchemas[existing.type].safeParse(rawPatch);
      if (!parsed.success) {
        throw new WidgetValidationError(
          parsed.error.issues.map(({ path, message }) => ({ path, message })),
        );
      }
      const patch: WidgetPatch = parsed.data;
      const changed = Object.entries(patch).some(
        ([field, value]) => existing[field as keyof Widget] !== value,
      );
      if (!changed) return existing; // no-op, skip the write

      const updated = await repository.patch(podId, widgetId, {
        ...patch,
        updatedAt: clock().toISOString(),
      });
      if (!updated) throw new WidgetNotFoundError(widgetId);

      await deleteImageIfReplaced(existing, updated);
      await pods.touch(podId);
      return updated;
    },

    /** Idempotent: deleting a missing widget is not an error. */
    async remove(podId: string, widgetId: string): Promise<void> {
      const existing = await repository.get(podId, widgetId);
      if (!existing) return;
      await repository.delete(podId, widgetId);
      if (existing.type === "image" && existing.imageId) await images.delete(existing.imageId);
      await pods.touch(podId);
    },

    // --- Pod content port: used by the pods feature via the composition root ---

    countByPod: (podIds: readonly string[]) => repository.countByPod(podIds),

    /** Copies every widget (and its image) under fresh ids, keeping the order. */
    async copyAll(fromPodId: string, toPodId: string): Promise<void> {
      const now = clock().toISOString();
      for (const widget of await list(fromPodId)) {
        const copy: Widget = { ...widget, id: newId(), createdAt: now, updatedAt: now };
        if (copy.type === "image" && copy.imageId) {
          const image = await images.get(copy.imageId);
          copy.imageId = image ? newId() : null;
          if (image && copy.imageId) {
            await images.put({ ...image, id: copy.imageId, podId: toPodId, createdAt: now });
          }
        }
        await repository.insertIfAbsent(toPodId, copy, { maxWidgets: maxWidgetsPerPod });
      }
    },

    async deleteAll(podId: string): Promise<void> {
      await repository.deleteAll(podId);
      await images.deleteByPod(podId);
    },
  };
}

export type WidgetService = ReturnType<typeof createWidgetService>;
