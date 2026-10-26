import type { Widget } from "./widget";

/** Response bodies shared by the route handlers and the browser API client. */

export type ListWidgetsResponse = { widgets: Widget[] };
export type WidgetResponse = { widget: Widget };

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "WIDGET_LIMIT_REACHED"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
};

export function widgetsPath(podId: string): string {
  return `/api/pods/${podId}/widgets`;
}

export function widgetPath(podId: string, widgetId: string): string {
  return `${widgetsPath(podId)}/${widgetId}`;
}
