import type { Widget, WidgetPatch } from "../domain/widget";
import type { InsertResult, WidgetRepository } from "./widget-repository";

/**
 * In-memory repository backed by nested Maps: O(1) get/insert/patch/delete
 * and O(n) list per pod. Each method mutates synchronously, so it is atomic
 * with respect to other requests. Values are copied in and out so callers can
 * never mutate stored state by accident.
 *
 * Used for local development, tests and Docker. It is not suitable for
 * serverless deployments, where each instance has its own memory.
 */
export class MemoryWidgetRepository implements WidgetRepository {
  private readonly pods = new Map<string, Map<string, Widget>>();

  async list(podId: string): Promise<Widget[]> {
    const pod = this.pods.get(podId);
    return pod ? Array.from(pod.values(), (widget) => ({ ...widget })) : [];
  }

  async get(podId: string, widgetId: string): Promise<Widget | null> {
    const widget = this.pods.get(podId)?.get(widgetId);
    return widget ? { ...widget } : null;
  }

  async insertIfAbsent(
    podId: string,
    widget: Widget,
    { maxWidgets }: { maxWidgets: number },
  ): Promise<InsertResult> {
    let pod = this.pods.get(podId);
    if (pod?.has(widget.id)) return "exists";
    if (pod && pod.size >= maxWidgets) return "limit_reached";
    if (!pod) {
      pod = new Map();
      this.pods.set(podId, pod);
    }
    pod.set(widget.id, { ...widget });
    return "created";
  }

  async patch(
    podId: string,
    widgetId: string,
    fields: WidgetPatch & { updatedAt: string },
  ): Promise<Widget | null> {
    const pod = this.pods.get(podId);
    const existing = pod?.get(widgetId);
    if (!pod || !existing) return null;
    const updated = { ...existing, ...fields } as Widget;
    pod.set(widgetId, updated);
    return { ...updated };
  }

  async delete(podId: string, widgetId: string): Promise<boolean> {
    const pod = this.pods.get(podId);
    if (!pod) return false;
    const deleted = pod.delete(widgetId);
    if (pod.size === 0) this.pods.delete(podId);
    return deleted;
  }

  async deleteAll(podId: string): Promise<void> {
    this.pods.delete(podId);
  }

  async countByPod(podIds: readonly string[]): Promise<Map<string, number>> {
    return new Map(podIds.map((id) => [id, this.pods.get(id)?.size ?? 0]));
  }
}
