import type { Pod, PodStats } from "../domain/pod";
import {
  EMPTY_STATS,
  type PodInsertResult,
  type PodPatch,
  type PodRepository,
} from "./pod-repository";

/** In-memory pods with a share-id index: every operation is O(1) except list. */
export class MemoryPodRepository implements PodRepository {
  private readonly pods = new Map<string, Pod>();
  private readonly byShareId = new Map<string, string>();
  private readonly stats = new Map<string, PodStats>();

  async list(): Promise<Pod[]> {
    return Array.from(this.pods.values(), (pod) => ({ ...pod }));
  }

  async get(podId: string): Promise<Pod | null> {
    const pod = this.pods.get(podId);
    return pod ? { ...pod } : null;
  }

  async getByShareId(shareId: string): Promise<Pod | null> {
    const podId = this.byShareId.get(shareId);
    return podId ? this.get(podId) : null;
  }

  async insert(pod: Pod, { maxPods }: { maxPods: number }): Promise<PodInsertResult> {
    if (this.pods.size >= maxPods) return "limit_reached";
    this.pods.set(pod.id, { ...pod });
    this.byShareId.set(pod.shareId, pod.id);
    return "created";
  }

  async patch(podId: string, fields: PodPatch): Promise<Pod | null> {
    const existing = this.pods.get(podId);
    if (!existing) return null;
    const updated = { ...existing, ...fields };
    this.pods.set(podId, updated);
    return { ...updated };
  }

  async delete(podId: string): Promise<boolean> {
    const pod = this.pods.get(podId);
    if (!pod) return false;
    this.pods.delete(podId);
    this.byShareId.delete(pod.shareId);
    this.stats.delete(podId);
    return true;
  }

  async recordView(podId: string, at: string): Promise<void> {
    if (!this.pods.has(podId)) return;
    const current = this.stats.get(podId) ?? EMPTY_STATS;
    this.stats.set(podId, { viewCount: current.viewCount + 1, lastViewedAt: at });
  }

  async getStats(podIds: readonly string[]): Promise<Map<string, PodStats>> {
    return new Map(podIds.map((id) => [id, { ...(this.stats.get(id) ?? EMPTY_STATS) }]));
  }
}
