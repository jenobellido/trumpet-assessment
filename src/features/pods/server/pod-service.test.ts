import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryPodRepository } from "./memory-pod-repository";
import { PodLimitReachedError, PodNotFoundError } from "./pod-errors";
import { createPodService, type PodContentPort, type PodService } from "./pod-service";

describe("pod service", () => {
  let now: Date;
  let content: { [K in keyof PodContentPort]: ReturnType<typeof vi.fn<PodContentPort[K]>> };
  let service: PodService;

  beforeEach(() => {
    now = new Date("2026-03-01T10:00:00.000Z");
    content = {
      countByPod: vi.fn<PodContentPort["countByPod"]>(
        async (ids) => new Map(ids.map((id) => [id, 2])),
      ),
      copyAll: vi.fn<PodContentPort["copyAll"]>(async () => {}),
      deleteAll: vi.fn<PodContentPort["deleteAll"]>(async () => {}),
    };
    service = createPodService({
      repository: new MemoryPodRepository(),
      content,
      clock: () => now,
      maxPods: 3,
    });
  });

  const advance = (ms: number) => (now = new Date(now.getTime() + ms));

  it("creates a pod with separate edit and share ids", async () => {
    const pod = await service.create({ title: "Acme", buyerName: "Acme Inc." });
    expect(pod).toMatchObject({ title: "Acme", buyerName: "Acme Inc." });
    expect(pod.shareId).not.toBe(pod.id);
    expect(await service.getByShareId(pod.shareId)).toEqual(pod);
  });

  it("lists pods most recently edited first, with counts and views", async () => {
    const older = await service.create({ title: "Older", buyerName: "" });
    advance(1_000);
    const newer = await service.create({ title: "Newer", buyerName: "" });
    await service.recordView(older.id);

    const pods = await service.list();

    expect(pods.map((p) => p.id)).toEqual([newer.id, older.id]);
    expect(pods[1]).toMatchObject({ widgetCount: 2, viewCount: 1 });
    expect(pods[0]).toMatchObject({ viewCount: 0, lastViewedAt: null });
  });

  it("updates details and bumps updatedAt", async () => {
    const pod = await service.create({ title: "", buyerName: "" });
    advance(5_000);
    const updated = await service.update(pod.id, { title: "Q3 proposal" });
    expect(updated).toMatchObject({ title: "Q3 proposal", updatedAt: now.toISOString() });
  });

  it("keeps both fields when title and buyer are saved at the same time (regression)", async () => {
    // Found in manual testing: the two inputs autosave independently, and a
    // read-modify-write of the whole pod let the last request erase the other.
    const pod = await service.create({ title: "", buyerName: "" });

    await Promise.all([
      service.update(pod.id, { title: "Acme Q4 renewal" }),
      service.update(pod.id, { buyerName: "Acme Inc." }),
      service.touch(pod.id),
    ]);

    expect(await service.get(pod.id)).toMatchObject({
      title: "Acme Q4 renewal",
      buyerName: "Acme Inc.",
    });
  });

  it("touch() moves a pod to the top of the dashboard after a content edit", async () => {
    const a = await service.create({ title: "A", buyerName: "" });
    advance(10);
    await service.create({ title: "B", buyerName: "" });
    advance(10);
    await service.touch(a.id);
    expect((await service.list())[0].id).toBe(a.id);
  });

  it("duplicates a pod with its content under a new share link", async () => {
    const source = await service.create({ title: "Template", buyerName: "Acme" });
    const copy = await service.duplicate(source.id);

    expect(copy).toMatchObject({ title: "Copy of Template", buyerName: "Acme" });
    expect(copy.id).not.toBe(source.id);
    expect(copy.shareId).not.toBe(source.shareId);
    expect(content.copyAll).toHaveBeenCalledWith(source.id, copy.id);
  });

  it("deletes a pod and cascades to its content", async () => {
    const pod = await service.create({ title: "", buyerName: "" });
    await service.remove(pod.id);
    expect(await service.exists(pod.id)).toBe(false);
    expect(await service.getByShareId(pod.shareId)).toBeNull();
    expect(content.deleteAll).toHaveBeenCalledWith(pod.id);
  });

  it("throws for unknown pods and enforces the pod limit", async () => {
    await expect(service.get(crypto.randomUUID())).rejects.toBeInstanceOf(PodNotFoundError);
    await expect(service.update(crypto.randomUUID(), { title: "x" })).rejects.toBeInstanceOf(
      PodNotFoundError,
    );
    for (let i = 0; i < 3; i++) await service.create({ title: "", buyerName: "" });
    await expect(service.create({ title: "", buyerName: "" })).rejects.toBeInstanceOf(
      PodLimitReachedError,
    );
  });
});
