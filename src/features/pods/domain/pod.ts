import { z } from "zod";

/** Domain model for pods (digital sales rooms). Isomorphic: shared by client and server. */

export const POD_LIMITS = {
  maxTitleLength: 120,
  maxBuyerNameLength: 120,
  /** Caps total storage for a single deployment. */
  maxPods: 100,
} as const;

export const podIdSchema = z.uuid();
/** Public, unguessable id used in buyer links. Never reveals the edit id. */
export const shareIdSchema = z.uuid();

const title = z.string().trim().max(POD_LIMITS.maxTitleLength);
const buyerName = z.string().trim().max(POD_LIMITS.maxBuyerNameLength);

export const podSchema = z.object({
  id: podIdSchema,
  shareId: shareIdSchema,
  title,
  buyerName,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Pod = z.infer<typeof podSchema>;

/** Engagement data kept apart from the pod so counting a view never rewrites the pod. */
export type PodStats = { viewCount: number; lastViewedAt: string | null };

export type PodSummary = Pod & PodStats & { widgetCount: number };

export const createPodInputSchema = z.object({
  title: title.default(""),
  buyerName: buyerName.default(""),
});

export const updatePodInputSchema = z
  .object({ title, buyerName })
  .partial()
  .refine((input) => Object.keys(input).length > 0, "Provide at least one field to update");

export type CreatePodInput = z.infer<typeof createPodInputSchema>;
export type UpdatePodInput = z.infer<typeof updatePodInputSchema>;

export function podDisplayTitle(pod: Pick<Pod, "title">): string {
  return pod.title || "Untitled pod";
}

/** Most recently edited first. */
export function compareByRecentlyUpdated(a: Pod, b: Pod): number {
  return a.updatedAt === b.updatedAt ? 0 : a.updatedAt > b.updatedAt ? -1 : 1;
}
