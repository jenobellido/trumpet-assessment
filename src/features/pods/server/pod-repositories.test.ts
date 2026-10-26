import { describe } from "vitest";
import { createRedisClient, readRedisConfig } from "@/shared/server/redis";
import { MemoryPodRepository } from "./memory-pod-repository";
import { describePodRepositoryContract } from "./pod-repository.contract";
import { RedisPodRepository } from "./redis-pod-repository";

describePodRepositoryContract("MemoryPodRepository", () => new MemoryPodRepository());

// Runs only when Upstash credentials are configured; keys are namespaced per run.
const config = readRedisConfig();
describe.skipIf(!config)("RedisPodRepository (integration)", () => {
  describePodRepositoryContract(
    "RedisPodRepository",
    () =>
      new RedisPodRepository(createRedisClient(config!), {
        keyPrefix: `test:${crypto.randomUUID()}:`,
      }),
  );
});
