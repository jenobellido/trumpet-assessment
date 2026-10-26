import { defaultFetch, requestJson } from "@/shared/lib/api-error";
import type { ListWidgetsResponse, WidgetResponse } from "../domain/api-contract";
import { widgetPath, widgetsPath } from "../domain/api-contract";
import { imagesUploadPath, type UploadedImage } from "../domain/image";
import type { Widget, WidgetPatch } from "../domain/widget";

export { ApiError, isRetryableError } from "@/shared/lib/api-error";

type RequestOptions = { keepalive?: boolean };

/** The fields a client sends to create a widget (server sets timestamps). */
export type NewWidget = Pick<Widget, "type" | "position"> & WidgetPatch;

/** Typed browser client for the widget and image APIs of a single pod. */
export function createWidgetsApi(podId: string, fetchImpl: typeof fetch = defaultFetch) {
  return {
    async list(): Promise<Widget[]> {
      const { widgets } = await requestJson<ListWidgetsResponse>(fetchImpl, widgetsPath(podId), {
        method: "GET",
      });
      return widgets;
    },

    async create(widgetId: string, widget: NewWidget): Promise<Widget> {
      const { widget: created } = await requestJson<WidgetResponse>(
        fetchImpl,
        widgetPath(podId, widgetId),
        { method: "PUT", body: JSON.stringify(widget) },
      );
      return created;
    },

    async update(widgetId: string, patch: WidgetPatch, { keepalive = false }: RequestOptions = {}) {
      await requestJson<WidgetResponse>(fetchImpl, widgetPath(podId, widgetId), {
        method: "PATCH",
        body: JSON.stringify(patch),
        keepalive,
      });
    },

    async remove(widgetId: string, { keepalive = false }: RequestOptions = {}) {
      await requestJson<void>(fetchImpl, widgetPath(podId, widgetId), {
        method: "DELETE",
        keepalive,
      });
    },

    async uploadImage(file: File): Promise<UploadedImage> {
      const form = new FormData();
      form.set("file", file);
      const { image } = await requestJson<{ image: UploadedImage }>(
        fetchImpl,
        imagesUploadPath(podId),
        { method: "POST", body: form },
      );
      return image;
    },
  };
}

export type WidgetsApi = ReturnType<typeof createWidgetsApi>;
