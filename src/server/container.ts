import "server-only";
import { createPodHttpHandlers, mapPodError } from "@/features/pods/server/pod-http-handlers";
import { MemoryPodRepository } from "@/features/pods/server/memory-pod-repository";
import type { PodRepository } from "@/features/pods/server/pod-repository";
import { createPodService } from "@/features/pods/server/pod-service";
import { RedisPodRepository } from "@/features/pods/server/redis-pod-repository";
import { createImageService } from "@/features/widgets/server/image-service";
import {
  MemoryImageStore,
  RedisImageStore,
  type ImageStore,
} from "@/features/widgets/server/image-store";
import { MemoryWidgetRepository } from "@/features/widgets/server/memory-widget-repository";
import { RedisWidgetRepository } from "@/features/widgets/server/redis-widget-repository";
import {
  createWidgetHttpHandlers,
  mapWidgetError,
} from "@/features/widgets/server/widget-http-handlers";
import type { WidgetRepository } from "@/features/widgets/server/widget-repository";
import { createWidgetService } from "@/features/widgets/server/widget-service";
import { createRouteHandler } from "@/shared/server/http";
import {
  createMemoryRateLimiter,
  createRedisRateLimiter,
  type RateLimiter,
  type RateLimitOptions,
} from "@/shared/server/rate-limit";
import { createRedisClient, readRedisConfig } from "@/shared/server/redis";

/**
 * Composition root: the only place that knows every feature. It picks the
 * storage adapters (Upstash Redis when its credentials are present, otherwise
 * in-memory) and wires features together through their ports, so `pods` and
 * `widgets` never import each other.
 */

const RATE_LIMIT: RateLimitOptions = { limit: 240, windowMs: 60_000 };

export type Adapters = {
  storage: "redis" | "memory";
  pods: PodRepository;
  widgets: WidgetRepository;
  images: ImageStore;
  rateLimiter: RateLimiter;
};

export function createAdapters(): Adapters {
  const config = readRedisConfig();
  if (!config) {
    return {
      storage: "memory",
      pods: new MemoryPodRepository(),
      widgets: new MemoryWidgetRepository(),
      images: new MemoryImageStore(),
      rateLimiter: createMemoryRateLimiter(RATE_LIMIT),
    };
  }
  const redis = createRedisClient(config);
  return {
    storage: "redis",
    pods: new RedisPodRepository(redis),
    widgets: new RedisWidgetRepository(redis),
    images: new RedisImageStore(redis),
    rateLimiter: createRedisRateLimiter(redis, RATE_LIMIT),
  };
}

export function createContainer(adapters: Adapters = createAdapters()) {
  // Widgets need pods (existence, "last edited"); pods need widgets (counts,
  // copy, cascade delete). These closures bind to `podService` lazily, which
  // breaks the cycle: they only run after everything below is constructed.
  const podLookup = {
    exists: (podId: string) => podService.exists(podId),
    touch: (podId: string) => podService.touch(podId),
  };

  const widgets = createWidgetService({
    repository: adapters.widgets,
    images: adapters.images,
    pods: podLookup,
  });
  const images = createImageService({ store: adapters.images, pods: podLookup });
  const podService = createPodService({ repository: adapters.pods, content: widgets });

  const handle = createRouteHandler({
    rateLimiter: adapters.rateLimiter,
    mapError: (error) => mapWidgetError(error) ?? mapPodError(error),
  });

  return {
    storage: adapters.storage,
    pods: podService,
    widgets,
    images,
    http: {
      pods: createPodHttpHandlers({ pods: podService, handle }),
      widgets: createWidgetHttpHandlers({ widgets, images, handle }),
    },
  };
}

export type Container = ReturnType<typeof createContainer>;

// Kept on globalThis so in-memory data survives Next.js hot reloads in
// development instead of silently resetting.
const globalForContainer = globalThis as typeof globalThis & { __container?: Container };

export function getContainer(): Container {
  globalForContainer.__container ??= createContainer();
  return globalForContainer.__container;
}
