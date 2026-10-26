import {
  compareByRecentlyUpdated,
  POD_LIMITS,
  type CreatePodInput,
  type Pod,
  type PodSummary,
  type UpdatePodInput,
} from "../domain/pod";
import { PodLimitReachedError, PodNotFoundError } from "./pod-errors";
import { EMPTY_STATS, type PodRepository } from "./pod-repository";

/**
 * What the pods feature needs from whatever lives inside a pod (widgets,
 * images). Implemented by the composition root, so this feature never
 * depends on the widgets feature directly.
 */
export interface PodContentPort {
  countByPod(podIds: readonly string[]): Promise<Map<string, number>>;
  copyAll(fromPodId: string, toPodId: string): Promise<void>;
  deleteAll(podId: string): Promise<void>;
}

export type PodServiceDeps = {
  repository: PodRepository;
  content: PodContentPort;
  clock?: () => Date;
  newId?: () => string;
  maxPods?: number;
};

export function createPodService({
  repository,
  content,
  clock = () => new Date(),
  newId = () => crypto.randomUUID(),
  maxPods = POD_LIMITS.maxPods,
}: PodServiceDeps) {
  async function insert(fields: Pick<Pod, "title" | "buyerName">): Promise<Pod> {
    const now = clock().toISOString();
    const pod: Pod = { id: newId(), shareId: newId(), ...fields, createdAt: now, updatedAt: now };
    if ((await repository.insert(pod, { maxPods })) === "limit_reached") {
      throw new PodLimitReachedError(maxPods);
    }
    return pod;
  }

  async function getOrThrow(podId: string): Promise<Pod> {
    const pod = await repository.get(podId);
    if (!pod) throw new PodNotFoundError(podId);
    return pod;
  }

  return {
    /** Dashboard view: pods with widget counts and engagement, most recent first. */
    async list(): Promise<PodSummary[]> {
      const pods = (await repository.list()).sort(compareByRecentlyUpdated);
      const ids = pods.map((pod) => pod.id);
      const [stats, counts] = await Promise.all([
        repository.getStats(ids),
        content.countByPod(ids),
      ]);
      return pods.map((pod) => ({
        ...pod,
        ...(stats.get(pod.id) ?? EMPTY_STATS),
        widgetCount: counts.get(pod.id) ?? 0,
      }));
    },

    get: getOrThrow,

    /** Like `get`, but `null` when missing: for pages that render a 404. */
    find: (podId: string) => repository.get(podId),

    exists: async (podId: string) => (await repository.get(podId)) !== null,

    getByShareId: (shareId: string) => repository.getByShareId(shareId),

    create: (input: CreatePodInput) => insert(input),

    async update(podId: string, input: UpdatePodInput): Promise<Pod> {
      const updated = await repository.patch(podId, { ...input, updatedAt: clock().toISOString() });
      if (!updated) throw new PodNotFoundError(podId);
      return updated;
    },

    /** Bumps `updatedAt` when a pod's content changes, so the dashboard order stays truthful. */
    async touch(podId: string): Promise<void> {
      await repository.patch(podId, { updatedAt: clock().toISOString() });
    },

    /** Copies a pod and all of its content under fresh ids, with a new buyer link. */
    async duplicate(podId: string): Promise<Pod> {
      const source = await getOrThrow(podId);
      const copy = await insert({
        title: `Copy of ${source.title || "Untitled pod"}`.slice(0, POD_LIMITS.maxTitleLength),
        buyerName: source.buyerName,
      });
      await content.copyAll(source.id, copy.id);
      return copy;
    },

    /** Idempotent. Removes the pod first so its links stop working immediately. */
    async remove(podId: string): Promise<void> {
      await repository.delete(podId);
      await content.deleteAll(podId);
    },

    async recordView(podId: string): Promise<void> {
      await repository.recordView(podId, clock().toISOString());
    },

    /** Counts a buyer view by public share id. Unknown links are ignored. */
    async recordViewByShareId(shareId: string): Promise<void> {
      const pod = await repository.getByShareId(shareId);
      if (pod) await repository.recordView(pod.id, clock().toISOString());
    },

    async getStats(podId: string) {
      return (await repository.getStats([podId])).get(podId) ?? EMPTY_STATS;
    },
  };
}

export type PodService = ReturnType<typeof createPodService>;
