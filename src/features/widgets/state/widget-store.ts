import { compareWidgets, positionBetween, type Widget, type WidgetPatch } from "../domain/widget";

type Listener = () => void;

/**
 * Normalised client-side widget state with fine-grained subscriptions.
 *
 * The board subscribes to the id list only; each widget subscribes to its own
 * entry. Typing in one widget therefore notifies and re-renders exactly one
 * component: O(1) work per keystroke regardless of how many widgets exist.
 * Updates are immutable, so `useSyncExternalStore` snapshots stay stable.
 */
export function createWidgetStore(initialWidgets: readonly Widget[]) {
  const sorted = [...initialWidgets].sort(compareWidgets);
  let ids: readonly string[] = sorted.map((widget) => widget.id);
  const byId = new Map(sorted.map((widget) => [widget.id, widget]));
  const idListeners = new Set<Listener>();
  const widgetListeners = new Map<string, Set<Listener>>();

  const emitIds = () => idListeners.forEach((listener) => listener());
  const emitWidget = (id: string) => widgetListeners.get(id)?.forEach((listener) => listener());

  function update(id: string, patch: WidgetPatch) {
    const widget = byId.get(id);
    if (!widget) return;
    const changed = Object.entries(patch).some(
      ([field, value]) => widget[field as keyof Widget] !== value,
    );
    if (!changed) return;
    byId.set(id, { ...widget, ...patch } as Widget);
    emitWidget(id);
  }

  return {
    getIds: () => ids,
    getWidget: (id: string) => byId.get(id),
    getWidgets: () => ids.map((id) => byId.get(id)!),
    get size() {
      return ids.length;
    },

    subscribeIds(listener: Listener) {
      idListeners.add(listener);
      return () => idListeners.delete(listener);
    },

    subscribeWidget(id: string, listener: Listener) {
      let listeners = widgetListeners.get(id);
      if (!listeners) {
        listeners = new Set();
        widgetListeners.set(id, listeners);
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) widgetListeners.delete(id);
      };
    },

    /** Order key for a widget appended at the end. */
    nextPosition: () => positionBetween(byId.get(ids.at(-1) ?? "")?.position ?? null, null),

    /**
     * Inserts in position order, so restoring a deleted widget puts it back
     * where it belongs even if other widgets were moved in the meantime.
     */
    add(widget: Widget) {
      if (byId.has(widget.id)) return;
      byId.set(widget.id, widget);
      const index = ids.findIndex((id) => compareWidgets(widget, byId.get(id)!) < 0);
      const next = [...ids];
      next.splice(index === -1 ? next.length : index, 0, widget.id);
      ids = next;
      emitIds();
    },

    update,

    setContent: (id: string, content: string) => update(id, { content }),

    /**
     * Moves a widget to `toIndex` and gives it an order key between its new
     * neighbours. Only the moved widget changes, so only it needs saving.
     * Returns the new position, or `null` if nothing moved.
     */
    move(id: string, toIndex: number): string | null {
      const from = ids.indexOf(id);
      const target = Math.max(0, Math.min(toIndex, ids.length - 1));
      if (from === -1 || from === target) return null;

      const rest = ids.filter((existing) => existing !== id);
      const before = target > 0 ? byId.get(rest[target - 1])!.position : null;
      const after = target < rest.length ? byId.get(rest[target])!.position : null;
      const position = positionBetween(before, after);

      rest.splice(target, 0, id);
      ids = rest;
      byId.set(id, { ...byId.get(id)!, position });
      emitIds();
      emitWidget(id);
      return position;
    },

    /** Removes a widget and returns it so it can be restored. */
    remove(id: string): Widget | null {
      const widget = byId.get(id);
      if (!widget) return null;
      byId.delete(id);
      ids = ids.filter((existing) => existing !== id);
      emitIds();
      return widget;
    },
  };
}

export type WidgetStore = ReturnType<typeof createWidgetStore>;
