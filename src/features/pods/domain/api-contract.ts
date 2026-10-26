import type { Pod, PodSummary } from "./pod";

export type ListPodsResponse = { pods: PodSummary[] };
export type PodResponse = { pod: Pod };

export const podsPath = "/api/pods";

export function podPath(podId: string): string {
  return `${podsPath}/${podId}`;
}

export function podEditorUrl(podId: string): string {
  return `/pods/${podId}`;
}

export function podShareUrl(shareId: string): string {
  return `/share/${shareId}`;
}

export function shareViewPath(shareId: string): string {
  return `/api/share/${shareId}/views`;
}
