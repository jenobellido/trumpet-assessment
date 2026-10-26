import type { Redis } from "@upstash/redis";
import { podSchema, type Pod, type PodStats } from "../domain/pod";
import {
  EMPTY_STATS,
  type PodInsertResult,
  type PodPatch,
  type PodRepository,
} from "./pod-repository";

/**
 * Redis layout:
 * - `pods`             hash  podId   → pod JSON
 * - `pod-share-ids`    hash  shareId → podId
 * - `pod-views`        hash  podId   → view count (HINCRBY, atomic)
 * - `pod-last-viewed`  hash  podId   → ISO timestamp
 */

const INSERT = `
if redis.call('HLEN', KEYS[1]) >= tonumber(ARGV[4]) then return 0 end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
redis.call('HSET', KEYS[2], ARGV[3], ARGV[1])
return 1
`;

const PATCH = `
local raw = redis.call('HGET', KEYS[1], ARGV[1])
if not raw then return false end
local pod = cjson.decode(raw)
for field, value in pairs(cjson.decode(ARGV[2])) do pod[field] = value end
local encoded = cjson.encode(pod)
redis.call('HSET', KEYS[1], ARGV[1], encoded)
return encoded
`;

export class RedisPodRepository implements PodRepository {
  private readonly keys;

  constructor(
    private readonly redis: Redis,
    { keyPrefix = "" }: { keyPrefix?: string } = {},
  ) {
    this.keys = {
      pods: `${keyPrefix}pods`,
      shareIds: `${keyPrefix}pod-share-ids`,
      views: `${keyPrefix}pod-views`,
      lastViewed: `${keyPrefix}pod-last-viewed`,
    };
  }

  async list(): Promise<Pod[]> {
    const hash = await this.redis.hgetall<Record<string, string>>(this.keys.pods);
    return hash ? Object.values(hash).map(deserialize) : [];
  }

  async get(podId: string): Promise<Pod | null> {
    const value = await this.redis.hget<string>(this.keys.pods, podId);
    return value ? deserialize(value) : null;
  }

  async getByShareId(shareId: string): Promise<Pod | null> {
    const podId = await this.redis.hget<string>(this.keys.shareIds, shareId);
    return podId ? this.get(podId) : null;
  }

  async insert(pod: Pod, { maxPods }: { maxPods: number }): Promise<PodInsertResult> {
    const result = await this.eval(
      INSERT,
      [this.keys.pods, this.keys.shareIds],
      [pod.id, JSON.stringify(pod), pod.shareId, String(maxPods)],
    );
    return result === 1 ? "created" : "limit_reached";
  }

  async patch(podId: string, fields: PodPatch): Promise<Pod | null> {
    const encoded = await this.redis.eval<string[], string | null>(
      PATCH,
      [this.keys.pods],
      [podId, JSON.stringify(fields)],
    );
    return encoded ? deserialize(encoded) : null;
  }

  async delete(podId: string): Promise<boolean> {
    const pod = await this.get(podId);
    if (!pod) return false;
    const tx = this.redis.multi();
    tx.hdel(this.keys.pods, podId);
    tx.hdel(this.keys.shareIds, pod.shareId);
    tx.hdel(this.keys.views, podId);
    tx.hdel(this.keys.lastViewed, podId);
    await tx.exec();
    return true;
  }

  async recordView(podId: string, at: string): Promise<void> {
    const tx = this.redis.multi();
    tx.hincrby(this.keys.views, podId, 1);
    tx.hset(this.keys.lastViewed, { [podId]: at });
    await tx.exec();
  }

  async getStats(podIds: readonly string[]): Promise<Map<string, PodStats>> {
    if (podIds.length === 0) return new Map();
    const [views, lastViewed] = await Promise.all([
      this.redis.hmget<Record<string, string | null>>(this.keys.views, ...podIds),
      this.redis.hmget<Record<string, string | null>>(this.keys.lastViewed, ...podIds),
    ]);
    return new Map(
      podIds.map((id) => [
        id,
        {
          viewCount: Number(views?.[id] ?? EMPTY_STATS.viewCount),
          lastViewedAt: lastViewed?.[id] ?? EMPTY_STATS.lastViewedAt,
        },
      ]),
    );
  }

  private async eval(script: string, keys: string[], args: string[]): Promise<number> {
    return Number(await this.redis.eval<string[], number | string>(script, keys, args));
  }
}

function deserialize(value: string): Pod {
  return podSchema.parse(JSON.parse(value));
}
