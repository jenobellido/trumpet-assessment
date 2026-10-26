import type { Redis } from "@upstash/redis";
import { widgetSchema, type Widget, type WidgetPatch } from "../domain/widget";
import type { InsertResult, WidgetRepository } from "./widget-repository";

/**
 * Redis repository: one hash per pod (`pod:{podId}:widgets`), field = widget
 * id, value = widget JSON. Writes are O(1) and a pod loads in one HGETALL.
 *
 * Conditional writes run as Lua scripts, so each is atomic on the server: no
 * check-then-write race between concurrent requests. Patches merge fields
 * inside the script, so concurrent updates to different fields of the same
 * widget (e.g. a reorder and a text save) both survive.
 */

const INSERT_IF_ABSENT = `
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 1 then return 0 end
if redis.call('HLEN', KEYS[1]) >= tonumber(ARGV[3]) then return -1 end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
return 1
`;

const PATCH = `
local raw = redis.call('HGET', KEYS[1], ARGV[1])
if not raw then return false end
local widget = cjson.decode(raw)
for field, value in pairs(cjson.decode(ARGV[2])) do widget[field] = value end
local encoded = cjson.encode(widget)
redis.call('HSET', KEYS[1], ARGV[1], encoded)
return encoded
`;

export class RedisWidgetRepository implements WidgetRepository {
  constructor(
    private readonly redis: Redis,
    private readonly keyPrefix = "",
  ) {}

  async list(podId: string): Promise<Widget[]> {
    const hash = await this.redis.hgetall<Record<string, string>>(this.key(podId));
    return hash ? Object.values(hash).map(deserialize) : [];
  }

  async get(podId: string, widgetId: string): Promise<Widget | null> {
    const value = await this.redis.hget<string>(this.key(podId), widgetId);
    return value ? deserialize(value) : null;
  }

  async insertIfAbsent(
    podId: string,
    widget: Widget,
    { maxWidgets }: { maxWidgets: number },
  ): Promise<InsertResult> {
    const result = Number(
      await this.redis.eval<string[], number | string>(
        INSERT_IF_ABSENT,
        [this.key(podId)],
        [widget.id, JSON.stringify(widget), String(maxWidgets)],
      ),
    );
    if (result === 1) return "created";
    return result === 0 ? "exists" : "limit_reached";
  }

  async patch(
    podId: string,
    widgetId: string,
    fields: WidgetPatch & { updatedAt: string },
  ): Promise<Widget | null> {
    const encoded = await this.redis.eval<string[], string | null>(
      PATCH,
      [this.key(podId)],
      [widgetId, JSON.stringify(fields)],
    );
    return encoded ? deserialize(encoded) : null;
  }

  async delete(podId: string, widgetId: string): Promise<boolean> {
    return (await this.redis.hdel(this.key(podId), widgetId)) > 0;
  }

  async deleteAll(podId: string): Promise<void> {
    await this.redis.del(this.key(podId));
  }

  async countByPod(podIds: readonly string[]): Promise<Map<string, number>> {
    if (podIds.length === 0) return new Map();
    const pipeline = this.redis.pipeline();
    for (const id of podIds) pipeline.hlen(this.key(id));
    const counts = await pipeline.exec<number[]>();
    return new Map(podIds.map((id, i) => [id, Number(counts[i] ?? 0)]));
  }

  private key(podId: string): string {
    return `${this.keyPrefix}pod:${podId}:widgets`;
  }
}

/** Validates on read so corrupted or legacy data fails loudly, not silently. */
function deserialize(value: string): Widget {
  return widgetSchema.parse(JSON.parse(value));
}
