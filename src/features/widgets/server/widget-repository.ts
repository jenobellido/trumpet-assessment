import type { Widget, WidgetPatch } from "../domain/widget";

export type InsertResult = "created" | "exists" | "limit_reached";

/**
 * Persistence port for widgets, scoped per pod.
 *
 * Writes are conditional and field-level so implementations can make them
 * atomic. That keeps a retried create idempotent, stops a late autosave from
 * resurrecting a deleted widget, and lets a reorder (position) and a text
 * save (content) on the same widget never overwrite each other.
 */
export interface WidgetRepository {
  list(podId: string): Promise<Widget[]>;
  get(podId: string, widgetId: string): Promise<Widget | null>;
  insertIfAbsent(
    podId: string,
    widget: Widget,
    options: { maxWidgets: number },
  ): Promise<InsertResult>;
  /** Merges `fields` into the stored widget. Returns `null` if it no longer exists. */
  patch(
    podId: string,
    widgetId: string,
    fields: WidgetPatch & { updatedAt: string },
  ): Promise<Widget | null>;
  /** Returns `false` when there was nothing to delete. */
  delete(podId: string, widgetId: string): Promise<boolean>;
  deleteAll(podId: string): Promise<void>;
  countByPod(podIds: readonly string[]): Promise<Map<string, number>>;
}
