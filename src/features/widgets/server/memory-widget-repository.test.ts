import { expect, it } from "vitest";
import type { TextWidget } from "../domain/widget";
import { MemoryWidgetRepository } from "./memory-widget-repository";
import { describeWidgetRepositoryContract, makeWidget } from "./widget-repository.contract";

describeWidgetRepositoryContract("MemoryWidgetRepository", () => new MemoryWidgetRepository());

it("does not leak references to stored widgets", async () => {
  const repository = new MemoryWidgetRepository();
  const podId = crypto.randomUUID();
  const widget = makeWidget({ content: "safe" });
  await repository.insertIfAbsent(podId, widget, { maxWidgets: 10 });

  widget.content = "mutated input";
  const [read] = (await repository.list(podId)) as TextWidget[];
  read.content = "mutated output";

  expect(((await repository.get(podId, widget.id)) as TextWidget).content).toBe("safe");
});
