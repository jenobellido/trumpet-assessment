import { describe } from "vitest";
import { createRedisClient, readRedisConfig } from "@/shared/server/redis";
import { RedisWidgetRepository } from "./redis-widget-repository";
import { describeWidgetRepositoryContract } from "./widget-repository.contract";

/**
 * Integration test against a real Upstash database. Skipped unless
 * UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are set, so the default
 * test run needs no external services. Keys are namespaced per run.
 */
const config = readRedisConfig();

describe.skipIf(!config)("RedisWidgetRepository (integration)", () => {
  describeWidgetRepositoryContract(
    "RedisWidgetRepository",
    () => new RedisWidgetRepository(createRedisClient(config!), `test:${crypto.randomUUID()}:`),
  );
});
