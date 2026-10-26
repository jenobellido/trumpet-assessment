import { defaultFetch, requestJson } from "@/shared/lib/api-error";
import { podPath, podsPath, type PodResponse } from "../domain/api-contract";
import type { CreatePodInput, Pod, UpdatePodInput } from "../domain/pod";

/** Typed browser client for the pods API. */
export function createPodsApi(fetchImpl: typeof fetch = defaultFetch) {
  return {
    async create(input: Partial<CreatePodInput> = {}): Promise<Pod> {
      return (
        await requestJson<PodResponse>(fetchImpl, podsPath, {
          method: "POST",
          body: JSON.stringify(input),
        })
      ).pod;
    },

    async update(
      podId: string,
      input: UpdatePodInput,
      { keepalive = false }: { keepalive?: boolean } = {},
    ): Promise<Pod> {
      return (
        await requestJson<PodResponse>(fetchImpl, podPath(podId), {
          method: "PATCH",
          body: JSON.stringify(input),
          keepalive,
        })
      ).pod;
    },

    async duplicate(podId: string): Promise<Pod> {
      return (
        await requestJson<PodResponse>(fetchImpl, `${podPath(podId)}/duplicate`, { method: "POST" })
      ).pod;
    },

    async remove(podId: string): Promise<void> {
      await requestJson<void>(fetchImpl, podPath(podId), { method: "DELETE" });
    },
  };
}

export type PodsApi = ReturnType<typeof createPodsApi>;
