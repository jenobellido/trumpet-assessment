import { HttpError, json, parseOrThrow, readJsonBody, type Handle } from "@/shared/server/http";
import type { ListWidgetsResponse, WidgetResponse } from "../domain/api-contract";
import { IMAGE_LIMITS } from "../domain/image";
import {
  createWidgetInputSchema,
  imageIdSchema,
  podIdSchema,
  widgetIdSchema,
} from "../domain/widget";
import type { ImageService } from "./image-service";
import {
  InvalidImageError,
  ParentPodNotFoundError,
  WidgetLimitReachedError,
  WidgetNotFoundError,
  WidgetValidationError,
} from "./widget-errors";
import type { WidgetService } from "./widget-service";

/** Max JSON body: 10k chars of 4-byte UTF-8 plus JSON overhead fits comfortably. */
const MAX_BODY_BYTES = 64 * 1024;
/** Multipart overhead allowance on top of the image limit. */
const MAX_UPLOAD_BYTES = IMAGE_LIMITS.maxBytes + 16 * 1024;

type PodParams = { podId: string };
type WidgetParams = { podId: string; widgetId: string };

export type WidgetHttpHandlerDeps = {
  widgets: WidgetService;
  images: ImageService;
  handle: Handle;
};

/**
 * HTTP adapter for widgets and images. Next.js route files stay one-liners,
 * and this layer can be tested with plain `Request` objects.
 */
export function createWidgetHttpHandlers({ widgets, images, handle }: WidgetHttpHandlerDeps) {
  return {
    list(request: Request, params: PodParams) {
      return handle(request, async () => {
        const podId = parseOrThrow(podIdSchema, params.podId, "pod id");
        const body: ListWidgetsResponse = { widgets: await widgets.list(podId) };
        return json(body);
      });
    },

    /** PUT = idempotent create. 201 when created, 200 when it already existed. */
    create(request: Request, params: WidgetParams) {
      return handle(request, async () => {
        const { podId, widgetId } = parseWidgetParams(params);
        const input = parseOrThrow(
          createWidgetInputSchema,
          await readJsonBody(request, { maxBytes: MAX_BODY_BYTES }),
          "widget",
        );
        const { widget, created } = await widgets.create(podId, widgetId, input);
        const body: WidgetResponse = { widget };
        return json(body, { status: created ? 201 : 200 });
      });
    },

    update(request: Request, params: WidgetParams) {
      return handle(request, async () => {
        const { podId, widgetId } = parseWidgetParams(params);
        const patch = await readJsonBody(request, { maxBytes: MAX_BODY_BYTES });
        const body: WidgetResponse = { widget: await widgets.update(podId, widgetId, patch) };
        return json(body);
      });
    },

    remove(request: Request, params: WidgetParams) {
      return handle(request, async () => {
        const { podId, widgetId } = parseWidgetParams(params);
        await widgets.remove(podId, widgetId);
        return new Response(null, { status: 204 });
      });
    },

    /** Multipart upload with a single `file` field. */
    uploadImage(request: Request, params: PodParams) {
      return handle(request, async () => {
        const podId = parseOrThrow(podIdSchema, params.podId, "pod id");
        if (Number(request.headers.get("content-length")) > MAX_UPLOAD_BYTES) {
          throw new InvalidImageError(
            `Images must be ${IMAGE_LIMITS.maxBytes / 1024 / 1024} MB or smaller`,
            "too_large",
          );
        }
        const form = await request.formData().catch(() => {
          throw new HttpError(400, "VALIDATION_ERROR", "Expected multipart/form-data");
        });
        const file = form.get("file");
        if (!(file instanceof Blob))
          throw new InvalidImageError("Choose a file to upload", "missing");

        const image = await images.upload(podId, new Uint8Array(await file.arrayBuffer()));
        return json({ image }, { status: 201 });
      });
    },

    /** Serves image bytes. Ids are unique and immutable, so responses cache forever. */
    getImage(request: Request, params: { imageId: string }) {
      return handle(request, async () => {
        const imageId = parseOrThrow(imageIdSchema, params.imageId, "image id");
        const image = await images.get(imageId);
        if (!image) throw new HttpError(404, "NOT_FOUND", "Image not found");
        return new Response(new Uint8Array(image.data), {
          headers: {
            "Content-Type": image.contentType,
            "Content-Length": String(image.size),
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'",
          },
        });
      });
    },
  };
}

export type WidgetHttpHandlers = ReturnType<typeof createWidgetHttpHandlers>;

function parseWidgetParams(params: WidgetParams) {
  return {
    podId: parseOrThrow(podIdSchema, params.podId, "pod id"),
    widgetId: parseOrThrow(widgetIdSchema, params.widgetId, "widget id"),
  };
}

export function mapWidgetError(error: unknown): HttpError | null {
  if (error instanceof WidgetNotFoundError) return new HttpError(404, "NOT_FOUND", error.message);
  if (error instanceof ParentPodNotFoundError) {
    return new HttpError(404, "POD_NOT_FOUND", error.message);
  }
  if (error instanceof WidgetLimitReachedError) {
    return new HttpError(409, "WIDGET_LIMIT_REACHED", error.message, { limit: error.limit });
  }
  if (error instanceof WidgetValidationError) {
    return new HttpError(400, "VALIDATION_ERROR", error.message, error.issues);
  }
  if (error instanceof InvalidImageError) {
    return error.reason === "too_large"
      ? new HttpError(413, "PAYLOAD_TOO_LARGE", error.message)
      : new HttpError(400, "INVALID_IMAGE", error.message);
  }
  return null;
}
