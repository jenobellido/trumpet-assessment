import type { Pod, PodStats } from "../domain/pod";

/** Fields that can change after creation. */
export type PodPatch = Partial<Pick<Pod, "title" | "buyerName">> & { updatedAt: string };

export type PodInsertResult = "created" | "limit_reached";

/**
 * Persistence port for pods and their engagement stats. Updates are
 * field-level merges so concurrent saves of different fields (title, buyer
 * name, "last edited") never overwrite each other.
 */
export interface PodRepository {
  list(): Promise<Pod[]>;
  get(podId: string): Promise<Pod | null>;
  getByShareId(shareId: string): Promise<Pod | null>;
  insert(pod: Pod, options: { maxPods: number }): Promise<PodInsertResult>;
  /** Atomically merges `fields`. Returns `null` when the pod no longer exists. */
  patch(podId: string, fields: PodPatch): Promise<Pod | null>;
  delete(podId: string): Promise<boolean>;
  /** Atomically increments the view count. */
  recordView(podId: string, at: string): Promise<void>;
  getStats(podIds: readonly string[]): Promise<Map<string, PodStats>>;
}

export const EMPTY_STATS: PodStats = { viewCount: 0, lastViewedAt: null };
