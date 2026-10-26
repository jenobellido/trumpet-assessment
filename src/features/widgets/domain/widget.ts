import { generateKeyBetween } from "fractional-indexing";
import { z } from "zod";

/**
 * Domain model and validation rules for widgets.
 *
 * This module is isomorphic: the server uses it to validate requests and the
 * client uses it for types and limits, so both sides share one contract.
 */

export const WIDGET_LIMITS = {
  /**
   * Generous compared to the 1,000 character requirement, while keeping the
   * worst-case UTF-8 payload (~40 KB) under the 64 KB browser limit for
   * `fetch(..., { keepalive: true })`, which we rely on to save on page exit.
   */
  maxContentLength: 10_000,
  maxAltLength: 300,
  maxCaptionLength: 300,
  /** Caps storage per pod. */
  maxWidgetsPerPod: 50,
} as const;

export const WIDGET_TYPES = ["text", "image"] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

export const podIdSchema = z.uuid();
export const widgetIdSchema = z.uuid();
export const imageIdSchema = z.uuid();

/**
 * Order keys are fractional-index strings ("a0", "a0V", "a1"…): moving a
 * widget only rewrites that widget's key, never its neighbours'.
 */
export const positionSchema = z
  .string()
  .regex(/^[0-9A-Za-z]{1,64}$/, "Position must be a fractional index key");

export const widgetContentSchema = z
  .string()
  .max(
    WIDGET_LIMITS.maxContentLength,
    `Content must be at most ${WIDGET_LIMITS.maxContentLength} characters`,
  );
const altSchema = z.string().max(WIDGET_LIMITS.maxAltLength);
const captionSchema = z.string().max(WIDGET_LIMITS.maxCaptionLength);

const baseFields = {
  id: widgetIdSchema,
  position: positionSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
};

export const textWidgetSchema = z.object({
  ...baseFields,
  type: z.literal("text"),
  content: widgetContentSchema,
});

export const imageWidgetSchema = z.object({
  ...baseFields,
  type: z.literal("image"),
  /** `null` until an image has been uploaded. */
  imageId: imageIdSchema.nullable(),
  alt: altSchema,
  caption: captionSchema,
});

/** New widget kinds (video, document…) become new members of this union. */
export const widgetSchema = z.discriminatedUnion("type", [textWidgetSchema, imageWidgetSchema]);

export type TextWidget = z.infer<typeof textWidgetSchema>;
export type ImageWidget = z.infer<typeof imageWidgetSchema>;
export type Widget = z.infer<typeof widgetSchema>;

/** Fields a client may set; identity, type and timestamps are server-owned. */
export type WidgetPatch = Partial<Omit<TextWidget, "id" | "type" | "createdAt" | "updatedAt">> &
  Partial<Omit<ImageWidget, "id" | "type" | "createdAt" | "updatedAt">>;

// Requests without a `type` are text widgets (the original, text-only API).
const defaultToText = (value: unknown) =>
  value && typeof value === "object" && !("type" in value) ? { ...value, type: "text" } : value;

export const createWidgetInputSchema = z.preprocess(
  defaultToText,
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("text"),
      content: widgetContentSchema.default(""),
      position: positionSchema.optional(),
    }),
    z.object({
      type: z.literal("image"),
      imageId: imageIdSchema.nullable().default(null),
      alt: altSchema.default(""),
      caption: captionSchema.default(""),
      position: positionSchema.optional(),
    }),
  ]),
);

export type CreateWidgetInput = z.infer<typeof createWidgetInputSchema>;

const nonEmpty = (patch: object) => Object.keys(patch).length > 0;
const NON_EMPTY_MESSAGE = "Provide at least one field to update";

/** Per-type patch validation: a text widget cannot be given an `alt`, etc. */
export const widgetPatchSchemas = {
  text: z
    .object({ content: widgetContentSchema, position: positionSchema })
    .partial()
    .refine(nonEmpty, NON_EMPTY_MESSAGE),
  image: z
    .object({
      imageId: imageIdSchema.nullable(),
      alt: altSchema,
      caption: captionSchema,
      position: positionSchema,
    })
    .partial()
    .refine(nonEmpty, NON_EMPTY_MESSAGE),
} satisfies Record<WidgetType, z.ZodType<WidgetPatch>>;

/** Display order: by position, id as a deterministic tie-breaker. */
export function compareWidgets(a: Widget, b: Widget): number {
  if (a.position !== b.position) return a.position < b.position ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Order key for a widget placed between two neighbours (either may be absent). */
export function positionBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before, after);
}

/** True when a widget has nothing a buyer could see. */
export function isWidgetEmpty(widget: Widget): boolean {
  return widget.type === "text" ? widget.content.trim() === "" : widget.imageId === null;
}
