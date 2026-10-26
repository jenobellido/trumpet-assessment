import { Ratelimit } from "@upstash/ratelimit";
import type { Redis } from "@upstash/redis";

export type RateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  /** Unix epoch in milliseconds when the window resets. */
  resetAt: number;
};

export interface RateLimiter {
  check(key: string): Promise<RateLimitResult>;
}

export type RateLimitOptions = { limit: number; windowMs: number };

/**
 * Fixed-window limiter held in process memory. Good enough for a single
 * long-running server; expired windows are swept lazily to bound memory.
 */
export function createMemoryRateLimiter(
  { limit, windowMs }: RateLimitOptions,
  now: () => number = Date.now,
): RateLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>();
  const SWEEP_THRESHOLD = 10_000;

  return {
    async check(key) {
      const timestamp = now();
      if (windows.size > SWEEP_THRESHOLD) {
        for (const [k, w] of windows) if (w.resetAt <= timestamp) windows.delete(k);
      }

      let window = windows.get(key);
      if (!window || window.resetAt <= timestamp) {
        window = { count: 0, resetAt: timestamp + windowMs };
        windows.set(key, window);
      }
      window.count += 1;

      return {
        success: window.count <= limit,
        limit,
        remaining: Math.max(0, limit - window.count),
        resetAt: window.resetAt,
      };
    },
  };
}

/** Sliding-window limiter shared by every serverless instance via Redis. */
export function createRedisRateLimiter(
  redis: Redis,
  { limit, windowMs }: RateLimitOptions,
): RateLimiter {
  const ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms`),
    prefix: "ratelimit:widgets",
  });

  return {
    async check(key) {
      const { success, limit: max, remaining, reset } = await ratelimit.limit(key);
      return { success, limit: max, remaining, resetAt: reset };
    },
  };
}
