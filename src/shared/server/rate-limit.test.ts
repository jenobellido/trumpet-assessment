import { describe, expect, it } from "vitest";
import { createMemoryRateLimiter } from "./rate-limit";

describe("memory rate limiter", () => {
  it("allows up to the limit within a window, then blocks", async () => {
    let now = 0;
    const limiter = createMemoryRateLimiter({ limit: 2, windowMs: 1_000 }, () => now);

    expect((await limiter.check("a")).success).toBe(true);
    const second = await limiter.check("a");
    expect(second).toMatchObject({ success: true, remaining: 0, resetAt: 1_000 });
    expect((await limiter.check("a")).success).toBe(false);

    now = 1_000;
    expect((await limiter.check("a")).success).toBe(true);
  });

  it("tracks keys independently", async () => {
    const limiter = createMemoryRateLimiter({ limit: 1, windowMs: 1_000 }, () => 0);
    expect((await limiter.check("a")).success).toBe(true);
    expect((await limiter.check("a")).success).toBe(false);
    expect((await limiter.check("b")).success).toBe(true);
  });
});
