import { HttpError, json, parseOrThrow, readJsonBody, type Handle } from "@/shared/server/http";
import type { ListPodsResponse, PodResponse } from "../domain/api-contract";
import {
  createPodInputSchema,
  podIdSchema,
  shareIdSchema,
  updatePodInputSchema,
} from "../domain/pod";
import { PodLimitReachedError, PodNotFoundError } from "./pod-errors";
import type { PodService } from "./pod-service";

const MAX_BODY_BYTES = 8 * 1024;

type PodParams = { podId: string };

export function createPodHttpHandlers({ pods, handle }: { pods: PodService; handle: Handle }) {
  return {
    list(request: Request) {
      return handle(request, async () => {
        const body: ListPodsResponse = { pods: await pods.list() };
        return json(body);
      });
    },

    create(request: Request) {
      return handle(request, async () => {
        const input = parseOrThrow(
          createPodInputSchema,
          await readJsonBody(request, { maxBytes: MAX_BODY_BYTES }),
          "pod",
        );
        const body: PodResponse = { pod: await pods.create(input) };
        return json(body, { status: 201 });
      });
    },

    get(request: Request, params: PodParams) {
      return handle(request, async () => {
        const body: PodResponse = { pod: await pods.get(parsePodId(params)) };
        return json(body);
      });
    },

    update(request: Request, params: PodParams) {
      return handle(request, async () => {
        const podId = parsePodId(params);
        const input = parseOrThrow(
          updatePodInputSchema,
          await readJsonBody(request, { maxBytes: MAX_BODY_BYTES }),
          "pod update",
        );
        const body: PodResponse = { pod: await pods.update(podId, input) };
        return json(body);
      });
    },

    duplicate(request: Request, params: PodParams) {
      return handle(request, async () => {
        const body: PodResponse = { pod: await pods.duplicate(parsePodId(params)) };
        return json(body, { status: 201 });
      });
    },

    /** Beacon endpoint: always 204, so it reveals nothing about which links exist. */
    recordView(request: Request, params: { shareId: string }) {
      return handle(request, async () => {
        await pods.recordViewByShareId(parseOrThrow(shareIdSchema, params.shareId, "share id"));
        return new Response(null, { status: 204 });
      });
    },

    remove(request: Request, params: PodParams) {
      return handle(request, async () => {
        await pods.remove(parsePodId(params));
        return new Response(null, { status: 204 });
      });
    },
  };
}

export type PodHttpHandlers = ReturnType<typeof createPodHttpHandlers>;

function parsePodId(params: PodParams): string {
  return parseOrThrow(podIdSchema, params.podId, "pod id");
}

export function mapPodError(error: unknown): HttpError | null {
  if (error instanceof PodNotFoundError) return new HttpError(404, "POD_NOT_FOUND", error.message);
  if (error instanceof PodLimitReachedError) {
    return new HttpError(409, "POD_LIMIT_REACHED", error.message, { limit: error.limit });
  }
  return null;
}
