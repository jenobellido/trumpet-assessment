import { beforeEach, describe, expect, it } from "vitest";
import { makeImageWidget, makeTextWidget as makeWidget } from "@test/widget-factories";
import type { ImageWidget, TextWidget, Widget } from "../domain/widget";
import type { WidgetRepository } from "./widget-repository";

export { makeImageWidget, makeTextWidget as makeWidget } from "@test/widget-factories";

/**
 * Behaviour every WidgetRepository adapter must satisfy. Running the same
 * suite against each adapter keeps them interchangeable.
 */
export function describeWidgetRepositoryContract(
  name: string,
  createRepository: () => WidgetRepository | Promise<WidgetRepository>,
) {
  describe(`${name} (WidgetRepository contract)`, () => {
    let repository: WidgetRepository;
    let podId: string;
    const limit = { maxWidgets: 3 };
    const later = "2026-02-01T00:00:00.000Z";

    beforeEach(async () => {
      repository = await createRepository();
      podId = crypto.randomUUID();
    });

    it("returns an empty list for an unknown pod", async () => {
      expect(await repository.list(podId)).toEqual([]);
      expect(await repository.get(podId, crypto.randomUUID())).toBeNull();
    });

    it("inserts and reads back text and image widgets", async () => {
      const text = makeWidget({ content: "hello" });
      const image = makeImageWidget({ imageId: crypto.randomUUID(), alt: "Logo" });
      expect(await repository.insertIfAbsent(podId, text, limit)).toBe("created");
      expect(await repository.insertIfAbsent(podId, image, limit)).toBe("created");

      expect(await repository.get(podId, text.id)).toEqual(text);
      expect(await repository.get(podId, image.id)).toEqual(image);
      expect(await repository.list(podId)).toHaveLength(2);
    });

    it("does not overwrite an existing widget on a repeated insert", async () => {
      const widget = makeWidget({ content: "original" });
      await repository.insertIfAbsent(podId, widget, limit);

      const result = await repository.insertIfAbsent(podId, { ...widget, content: "dupe" }, limit);

      expect(result).toBe("exists");
      expect((await repository.get(podId, widget.id)) as TextWidget).toMatchObject({
        content: "original",
      });
    });

    it("refuses inserts beyond the widget limit", async () => {
      for (let i = 0; i < limit.maxWidgets; i++) {
        await repository.insertIfAbsent(podId, makeWidget(), limit);
      }
      expect(await repository.insertIfAbsent(podId, makeWidget(), limit)).toBe("limit_reached");
      expect(await repository.list(podId)).toHaveLength(limit.maxWidgets);
    });

    it("patches only existing widgets and returns the merged result", async () => {
      const widget = makeWidget();
      expect(
        await repository.patch(podId, widget.id, { content: "x", updatedAt: later }),
      ).toBeNull();
      expect(await repository.get(podId, widget.id)).toBeNull();

      await repository.insertIfAbsent(podId, widget, limit);
      const patched = await repository.patch(podId, widget.id, {
        content: "new",
        updatedAt: later,
      });

      expect(patched).toEqual({ ...widget, content: "new", updatedAt: later });
      expect(await repository.get(podId, widget.id)).toEqual(patched);
    });

    it("keeps both fields when different fields are patched (reorder + text save)", async () => {
      const widget = makeWidget({ content: "old", position: "a0" });
      await repository.insertIfAbsent(podId, widget, limit);

      await Promise.all([
        repository.patch(podId, widget.id, { content: "new text", updatedAt: later }),
        repository.patch(podId, widget.id, { position: "a5", updatedAt: later }),
      ]);

      expect(await repository.get(podId, widget.id)).toMatchObject({
        content: "new text",
        position: "a5",
      });
    });

    it("can clear a nullable field", async () => {
      const image = makeImageWidget({ imageId: crypto.randomUUID() });
      await repository.insertIfAbsent(podId, image, limit);
      await repository.patch(podId, image.id, { imageId: null, updatedAt: later });
      expect(((await repository.get(podId, image.id)) as ImageWidget).imageId).toBeNull();
    });

    it("deletes a widget and reports whether it existed", async () => {
      const widget = makeWidget();
      await repository.insertIfAbsent(podId, widget, limit);

      expect(await repository.delete(podId, widget.id)).toBe(true);
      expect(await repository.delete(podId, widget.id)).toBe(false);
      expect(await repository.list(podId)).toEqual([]);
    });

    it("deletes all widgets of a pod and counts per pod", async () => {
      const otherPod = crypto.randomUUID();
      await repository.insertIfAbsent(podId, makeWidget(), limit);
      await repository.insertIfAbsent(podId, makeWidget(), limit);
      await repository.insertIfAbsent(otherPod, makeWidget(), limit);

      expect(await repository.countByPod([podId, otherPod])).toEqual(
        new Map([
          [podId, 2],
          [otherPod, 1],
        ]),
      );
      await repository.deleteAll(podId);
      expect(await repository.list(podId)).toEqual([]);
      expect(await repository.list(otherPod)).toHaveLength(1);
    });

    it("isolates widgets between pods", async () => {
      const otherPod = crypto.randomUUID();
      const widget = makeWidget();
      await repository.insertIfAbsent(podId, widget, limit);

      expect(await repository.list(otherPod)).toEqual([]);
      expect(await repository.get(otherPod, widget.id)).toBeNull();
    });

    it("stores large content intact", async () => {
      const content = "ä€😀x".repeat(2_500); // 10,000 UTF-16 units, multi-byte
      const widget: Widget = makeWidget({ content });
      await repository.insertIfAbsent(podId, widget, limit);
      expect(((await repository.get(podId, widget.id)) as TextWidget).content).toBe(content);
    });
  });
}
