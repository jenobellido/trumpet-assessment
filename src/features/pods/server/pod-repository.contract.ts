import { beforeEach, describe, expect, it } from "vitest";
import type { Pod } from "../domain/pod";
import type { PodRepository } from "./pod-repository";

export function makePod(overrides: Partial<Pod> = {}): Pod {
  return {
    id: crypto.randomUUID(),
    shareId: crypto.randomUUID(),
    title: "Acme renewal",
    buyerName: "Acme Inc.",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Behaviour every PodRepository adapter must satisfy. */
export function describePodRepositoryContract(
  name: string,
  createRepository: () => PodRepository | Promise<PodRepository>,
) {
  describe(`${name} (PodRepository contract)`, () => {
    let repository: PodRepository;
    const limit = { maxPods: 3 };

    beforeEach(async () => {
      repository = await createRepository();
    });

    it("inserts a pod and finds it by id and by share id", async () => {
      const pod = makePod();
      expect(await repository.insert(pod, limit)).toBe("created");

      expect(await repository.get(pod.id)).toEqual(pod);
      expect(await repository.getByShareId(pod.shareId)).toEqual(pod);
      expect(await repository.list()).toEqual([pod]);
    });

    it("returns null for unknown ids", async () => {
      expect(await repository.get(crypto.randomUUID())).toBeNull();
      expect(await repository.getByShareId(crypto.randomUUID())).toBeNull();
    });

    it("refuses inserts beyond the pod limit", async () => {
      for (let i = 0; i < limit.maxPods; i++) await repository.insert(makePod(), limit);
      expect(await repository.insert(makePod(), limit)).toBe("limit_reached");
    });

    it("patches only pods that exist and returns the merged pod", async () => {
      const pod = makePod();
      const updatedAt = "2026-02-01T00:00:00.000Z";
      expect(await repository.patch(pod.id, { title: "Renamed", updatedAt })).toBeNull();

      await repository.insert(pod, limit);
      const patched = await repository.patch(pod.id, { title: "Renamed", updatedAt });
      expect(patched).toEqual({ ...pod, title: "Renamed", updatedAt });
      expect(await repository.get(pod.id)).toEqual(patched);
    });

    it("keeps every field when different fields are saved at the same time", async () => {
      const pod = makePod({ title: "Old", buyerName: "Old buyer" });
      await repository.insert(pod, limit);

      await Promise.all([
        repository.patch(pod.id, { title: "New title", updatedAt: "2026-02-01T00:00:00.000Z" }),
        repository.patch(pod.id, { buyerName: "New buyer", updatedAt: "2026-02-01T00:00:01.000Z" }),
        repository.patch(pod.id, { updatedAt: "2026-02-01T00:00:02.000Z" }),
      ]);

      expect(await repository.get(pod.id)).toMatchObject({
        title: "New title",
        buyerName: "New buyer",
      });
    });

    it("counts views atomically and reports stats per pod", async () => {
      const [viewed, unseen] = [makePod(), makePod()];
      await repository.insert(viewed, limit);
      await repository.insert(unseen, limit);

      await Promise.all([
        repository.recordView(viewed.id, "2026-01-02T00:00:00.000Z"),
        repository.recordView(viewed.id, "2026-01-03T00:00:00.000Z"),
      ]);

      const stats = await repository.getStats([viewed.id, unseen.id]);
      expect(stats.get(viewed.id)?.viewCount).toBe(2);
      expect(stats.get(viewed.id)?.lastViewedAt).not.toBeNull();
      expect(stats.get(unseen.id)).toEqual({ viewCount: 0, lastViewedAt: null });
    });

    it("deletes a pod, its share link and its stats", async () => {
      const pod = makePod();
      await repository.insert(pod, limit);
      await repository.recordView(pod.id, "2026-01-02T00:00:00.000Z");

      expect(await repository.delete(pod.id)).toBe(true);
      expect(await repository.delete(pod.id)).toBe(false);
      expect(await repository.get(pod.id)).toBeNull();
      expect(await repository.getByShareId(pod.shareId)).toBeNull();
      expect((await repository.getStats([pod.id])).get(pod.id)?.viewCount).toBe(0);
    });
  });
}
