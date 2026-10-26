import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImageWidget, TextWidget } from "../domain/widget";
import { MemoryImageStore, type StoredImage } from "./image-store";
import { MemoryWidgetRepository } from "./memory-widget-repository";
import {
  ParentPodNotFoundError,
  WidgetLimitReachedError,
  WidgetNotFoundError,
  WidgetValidationError,
} from "./widget-errors";
import { createWidgetService, type PodLookupPort, type WidgetService } from "./widget-service";

function storedImage(podId: string, id = crypto.randomUUID()): StoredImage {
  return {
    id,
    podId,
    contentType: "image/png",
    size: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
    data: new Uint8Array([1, 2, 3]),
  };
}

describe("widget service", () => {
  let repository: MemoryWidgetRepository;
  let images: MemoryImageStore;
  let service: WidgetService;
  let now: Date;
  let pods: {
    exists: ReturnType<typeof vi.fn<PodLookupPort["exists"]>>;
    touch: ReturnType<typeof vi.fn<PodLookupPort["touch"]>>;
  };
  const podId = crypto.randomUUID();

  beforeEach(() => {
    now = new Date("2026-03-01T10:00:00.000Z");
    repository = new MemoryWidgetRepository();
    images = new MemoryImageStore();
    pods = {
      exists: vi.fn<PodLookupPort["exists"]>(async () => true),
      touch: vi.fn<PodLookupPort["touch"]>(async () => {}),
    };
    service = createWidgetService({
      repository,
      images,
      pods,
      clock: () => now,
      maxWidgetsPerPod: 3,
    });
  });

  const advance = (ms: number) => (now = new Date(now.getTime() + ms));
  const createText = (content = "", id = crypto.randomUUID()) =>
    service.create(podId, id, { type: "text", content });
  const createImage = (imageId: string | null = null) =>
    service.create(podId, crypto.randomUUID(), { type: "image", imageId, alt: "", caption: "" });

  describe("create", () => {
    it("creates a text widget with server-side timestamps and a position", async () => {
      const id = crypto.randomUUID();
      const { widget, created } = await createText("", id);

      expect(created).toBe(true);
      expect(widget).toEqual({
        id,
        type: "text",
        content: "",
        position: expect.any(String),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });
      expect(pods.touch).toHaveBeenCalledWith(podId);
    });

    it("creates an image widget", async () => {
      const { widget } = await createImage();
      expect(widget).toMatchObject({ type: "image", imageId: null, alt: "", caption: "" });
    });

    it("appends new widgets after the last one", async () => {
      const a = (await createText("a")).widget;
      const b = (await createText("b")).widget;
      const c = (await createImage()).widget;
      expect(a.position < b.position && b.position < c.position).toBe(true);
      expect((await service.list(podId)).map((w) => w.id)).toEqual([a.id, b.id, c.id]);
    });

    it("respects a client-provided position", async () => {
      const last = (await createText("last")).widget;
      const { widget } = await service.create(podId, crypto.randomUUID(), {
        type: "text",
        content: "first",
        position: "Zz",
      });
      expect((await service.list(podId)).map((w) => w.id)).toEqual([widget.id, last.id]);
    });

    it("is idempotent: creating the same id twice returns the original widget", async () => {
      const id = crypto.randomUUID();
      const first = await createText("first", id);
      advance(1_000);
      const second = await createText("second", id);

      expect(second.created).toBe(false);
      expect(second.widget).toEqual(first.widget);
      expect(await service.list(podId)).toHaveLength(1);
    });

    it("refuses widgets for a pod that does not exist", async () => {
      pods.exists.mockResolvedValue(false);
      await expect(createText()).rejects.toBeInstanceOf(ParentPodNotFoundError);
    });

    it("enforces the per-pod widget limit", async () => {
      await createText();
      await createText();
      await createText();
      await expect(createText()).rejects.toBeInstanceOf(WidgetLimitReachedError);
    });
  });

  describe("update", () => {
    it("updates text content and bumps updatedAt only", async () => {
      const { widget } = await createText();
      advance(5_000);

      const updated = (await service.update(podId, widget.id, { content: "hello" })) as TextWidget;

      expect(updated.content).toBe("hello");
      expect(updated.createdAt).toBe(widget.createdAt);
      expect(updated.updatedAt).toBe(now.toISOString());
      expect(await repository.get(podId, widget.id)).toEqual(updated);
    });

    it("moves a widget by updating its position", async () => {
      const a = (await createText("a")).widget;
      const b = (await createText("b")).widget;

      await service.update(podId, b.id, { position: "Zz" }); // before "a0"

      expect((await service.list(podId)).map((w) => w.id)).toEqual([b.id, a.id]);
    });

    it("validates the patch against the widget's own type", async () => {
      const text = (await createText()).widget;
      const image = (await createImage()).widget;

      await expect(service.update(podId, text.id, { alt: "nope" })).rejects.toBeInstanceOf(
        WidgetValidationError,
      );
      await expect(service.update(podId, image.id, { content: "nope" })).rejects.toBeInstanceOf(
        WidgetValidationError,
      );
      await expect(service.update(podId, text.id, {})).rejects.toBeInstanceOf(
        WidgetValidationError,
      );
    });

    it("skips the write when nothing changed", async () => {
      const { widget } = await createText("same");
      const spy = vi.spyOn(repository, "patch");

      await service.update(podId, widget.id, { content: "same" });

      expect(spy).not.toHaveBeenCalled();
    });

    it("throws when updating a missing widget (no resurrection after delete)", async () => {
      const { widget } = await createText();
      await service.remove(podId, widget.id);

      await expect(service.update(podId, widget.id, { content: "late" })).rejects.toBeInstanceOf(
        WidgetNotFoundError,
      );
      expect(await service.list(podId)).toEqual([]);
    });

    it("deletes the previous image when it is replaced", async () => {
      const [oldImage, newImage] = [storedImage(podId), storedImage(podId)];
      await images.put(oldImage);
      await images.put(newImage);
      const { widget } = await createImage(oldImage.id);

      const updated = (await service.update(podId, widget.id, {
        imageId: newImage.id,
        alt: "Team photo",
      })) as ImageWidget;

      expect(updated).toMatchObject({ imageId: newImage.id, alt: "Team photo" });
      expect(await images.get(oldImage.id)).toBeNull();
      expect(await images.get(newImage.id)).not.toBeNull();
    });
  });

  describe("remove", () => {
    it("deletes an image widget together with its image", async () => {
      const image = storedImage(podId);
      await images.put(image);
      const { widget } = await createImage(image.id);

      await service.remove(podId, widget.id);

      expect(await images.get(image.id)).toBeNull();
    });

    it("treats deleting a missing widget as a no-op", async () => {
      await expect(service.remove(podId, crypto.randomUUID())).resolves.toBeUndefined();
    });
  });

  describe("pod content", () => {
    it("copies all widgets and images to another pod under fresh ids, keeping order", async () => {
      const image = storedImage(podId);
      await images.put(image);
      await createText("intro");
      await createImage(image.id);
      const targetPod = crypto.randomUUID();

      await service.copyAll(podId, targetPod);

      const [source, copy] = [await service.list(podId), await service.list(targetPod)];
      expect(copy.map((w) => w.type)).toEqual(["text", "image"]);
      expect(copy.map((w) => w.id)).not.toEqual(source.map((w) => w.id));
      expect((copy[0] as TextWidget).content).toBe("intro");
      const copiedImageId = (copy[1] as ImageWidget).imageId!;
      expect(copiedImageId).not.toBe(image.id);
      expect((await images.get(copiedImageId))?.podId).toBe(targetPod);
    });

    it("deletes all widgets and images of a pod", async () => {
      const image = storedImage(podId);
      await images.put(image);
      await createImage(image.id);

      await service.deleteAll(podId);

      expect(await service.list(podId)).toEqual([]);
      expect(await images.get(image.id)).toBeNull();
    });
  });
});
