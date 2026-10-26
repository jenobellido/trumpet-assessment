import { describe, expect, it } from "vitest";
import { readRedisConfig } from "./redis";

describe("readRedisConfig", () => {
  it("returns null when Redis is not configured", () => {
    expect(readRedisConfig({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it("reads native Upstash variables", () => {
    const env = { UPSTASH_REDIS_REST_URL: "https://u", UPSTASH_REDIS_REST_TOKEN: "t" };
    expect(readRedisConfig(env as unknown as NodeJS.ProcessEnv)).toEqual({
      url: "https://u",
      token: "t",
    });
  });

  it("falls back to Vercel Marketplace KV_* variables", () => {
    const env = { KV_REST_API_URL: "https://kv", KV_REST_API_TOKEN: "k" };
    expect(readRedisConfig(env as unknown as NodeJS.ProcessEnv)).toEqual({
      url: "https://kv",
      token: "k",
    });
  });
});
