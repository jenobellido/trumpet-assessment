import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeImageWidget, makeTextWidget } from "@test/widget-factories";
import type { TextWidget } from "../domain/widget";
import { useWidget, useWidgetIds } from "./use-widget-store";
import { createWidgetStore } from "./widget-store";

const text = (id: string, content = "") => makeTextWidget({ id, content });
const contentOf = (widget: unknown) => (widget as TextWidget | undefined)?.content;

describe("widget store", () => {
  it("orders widgets by position, whatever order they arrive in", () => {
    const [a, b, c] = [text("a"), text("b"), text("c")];
    const store = createWidgetStore([c, a, b]);
    expect(store.getIds()).toEqual(["a", "b", "c"]);
  });

  it("ignores duplicate adds", () => {
    const store = createWidgetStore([text("a")]);
    store.add(text("a", "other"));
    expect(store.getIds()).toEqual(["a"]);
    expect(contentOf(store.getWidget("a"))).toBe("");
  });

  it("appends new widgets after the last one", () => {
    const store = createWidgetStore([text("a"), text("b")]);
    const position = store.nextPosition();
    store.add(makeTextWidget({ id: "new", position }));
    expect(store.getIds()).toEqual(["a", "b", "new"]);
  });

  it("notifies only the edited widget's subscribers on content change", () => {
    const store = createWidgetStore([text("a"), text("b")]);
    const [onIds, onA, onB] = [vi.fn(), vi.fn(), vi.fn()];
    store.subscribeIds(onIds);
    store.subscribeWidget("a", onA);
    store.subscribeWidget("b", onB);

    store.setContent("a", "typing");

    expect(onA).toHaveBeenCalledOnce();
    expect(onB).not.toHaveBeenCalled();
    expect(onIds).not.toHaveBeenCalled();
  });

  it("updates immutably so snapshots change only for the edited widget", () => {
    const store = createWidgetStore([text("a"), text("b")]);
    const [a, b, ids] = [store.getWidget("a"), store.getWidget("b"), store.getIds()];

    store.setContent("a", "new");

    expect(store.getWidget("a")).not.toBe(a);
    expect(store.getWidget("b")).toBe(b);
    expect(store.getIds()).toBe(ids);
  });

  it("updates fields of any widget type and skips no-op updates", () => {
    const image = makeImageWidget({ id: "img" });
    const store = createWidgetStore([image]);
    const listener = vi.fn();
    store.subscribeWidget("img", listener);

    store.update("img", { alt: "Team photo" });
    store.update("img", { alt: "Team photo" });

    expect(store.getWidget("img")).toMatchObject({ alt: "Team photo" });
    expect(listener).toHaveBeenCalledOnce();
  });

  describe("move", () => {
    it.each([
      ["to the top", "c", 0, ["c", "a", "b"]],
      ["to the bottom", "a", 2, ["b", "c", "a"]],
      ["into the middle", "c", 1, ["a", "c", "b"]],
    ])("moves a widget %s and keeps positions consistent", (_label, id, toIndex, expected) => {
      const store = createWidgetStore([text("a"), text("b"), text("c")]);

      expect(store.move(id, toIndex)).toEqual(expect.any(String));

      expect(store.getIds()).toEqual(expected);
      // Positions alone reproduce the new order, e.g. after a reload.
      expect(createWidgetStore(store.getWidgets()).getIds()).toEqual(expected);
    });

    it("changes only the moved widget", () => {
      const store = createWidgetStore([text("a"), text("b"), text("c")]);
      const [a, b] = [store.getWidget("a"), store.getWidget("b")];

      store.move("c", 0);

      expect(store.getWidget("a")).toBe(a);
      expect(store.getWidget("b")).toBe(b);
    });

    it("returns null when nothing moves", () => {
      const store = createWidgetStore([text("a"), text("b")]);
      expect(store.move("a", 0)).toBeNull();
      expect(store.move("missing", 1)).toBeNull();
    });
  });

  it("removes a widget and restores it in position order", () => {
    const store = createWidgetStore([text("a"), text("b", "keep me"), text("c")]);
    const removed = store.remove("b");
    expect(store.getIds()).toEqual(["a", "c"]);

    store.move("c", 0); // other widgets move while "b" is deleted
    store.add(removed!);

    expect(store.getIds()).toEqual(["c", "a", "b"]);
    expect(contentOf(store.getWidget("b"))).toBe("keep me");
  });

  it("returns null when removing an unknown widget", () => {
    expect(createWidgetStore([]).remove("missing")).toBeNull();
  });
});

describe("store hooks", () => {
  it("re-renders only the widget being edited (O(1) renders per keystroke)", () => {
    const store = createWidgetStore([text("a"), text("b")]);
    const renders = { a: 0, b: 0, ids: 0 };

    const a = renderHook(() => {
      renders.a++;
      return useWidget(store, "a");
    });
    renderHook(() => {
      renders.b++;
      return useWidget(store, "b");
    });
    renderHook(() => {
      renders.ids++;
      return useWidgetIds(store);
    });
    const baseline = { ...renders };

    act(() => {
      store.setContent("a", "h");
      store.setContent("a", "he");
      store.setContent("a", "hey");
    });

    expect(contentOf(a.result.current)).toBe("hey");
    expect(renders.a).toBeGreaterThan(baseline.a);
    expect(renders.b).toBe(baseline.b);
    expect(renders.ids).toBe(baseline.ids);
  });
});
