import "server-only";
import { Redis } from "@upstash/redis";

export type RedisConfig = { url: string; token: string };

/**
 * Reads Upstash credentials from the environment. Supports both the native
 * Upstash variable names and the `KV_*` names injected by the Vercel
 * Marketplace integration. Returns `null` when Redis is not configured.
 */
export function readRedisConfig(env: NodeJS.ProcessEnv = process.env): RedisConfig | null {
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

export function createRedisClient(config: RedisConfig): Redis {
  // We serialise values ourselves so reads are validated explicitly.
  return new Redis({ ...config, automaticDeserialization: false });
}
