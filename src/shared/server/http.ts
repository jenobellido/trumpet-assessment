import type { z } from "zod";
import type { RateLimiter } from "./rate-limit";

/** Small, framework-agnostic helpers for JSON route handlers. */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

export function errorResponse(error: HttpError, headers?: HeadersInit): Response {
  const body = {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  };
  return json(body, { status: error.status, headers });
}

/**
 * Reads a JSON body while enforcing a byte limit, so an oversized payload is
 * rejected before it is parsed.
 */
export async function readJsonBody(request: Request, { maxBytes }: { maxBytes: number }) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (declaredLength > maxBytes) throw payloadTooLarge(maxBytes);

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw payloadTooLarge(maxBytes);
  if (text.trim() === "") return {};

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, "VALIDATION_ERROR", "Request body must be valid JSON");
  }
}

export function parseOrThrow<T extends z.ZodType>(schema: T, value: unknown, label: string) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      `Invalid ${label}`,
      result.error.issues.map(({ path, message }) => ({ path, message })),
    );
  }
  return result.data as z.output<T>;
}

/** Best-effort client identifier for rate limiting behind a proxy (e.g. Vercel). */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function payloadTooLarge(maxBytes: number): HttpError {
  return new HttpError(413, "PAYLOAD_TOO_LARGE", `Request body exceeds ${maxBytes} bytes`);
}

export type ErrorMapper = (error: unknown) => HttpError | null;

export type RouteHandlerDeps = {
  rateLimiter: RateLimiter;
  /** Translates domain errors into HTTP errors; unknown errors become a 500. */
  mapError: ErrorMapper;
  logger?: Pick<Console, "error">;
};

export type Handle = (request: Request, run: () => Promise<Response>) => Promise<Response>;

/**
 * Wraps a route body with per-IP rate limiting, standard rate-limit headers
 * and consistent error responses. Internal errors are logged, never leaked.
 */
export function createRouteHandler({
  rateLimiter,
  mapError,
  logger = console,
}: RouteHandlerDeps): Handle {
  return async (request, run) => {
    const rate = await rateLimiter.check(clientIp(request));
    const rateHeaders = {
      "RateLimit-Limit": String(rate.limit),
      "RateLimit-Remaining": String(rate.remaining),
    };
    if (!rate.success) {
      const retryAfter = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000));
      return errorResponse(new HttpError(429, "RATE_LIMITED", "Too many requests"), {
        ...rateHeaders,
        "Retry-After": String(retryAfter),
      });
    }

    try {
      const response = await run();
      for (const [name, value] of Object.entries(rateHeaders)) response.headers.set(name, value);
      return response;
    } catch (error) {
      const httpError = error instanceof HttpError ? error : mapError(error);
      if (httpError) return errorResponse(httpError, rateHeaders);
      logger.error("Unhandled error in route handler", error);
      return errorResponse(
        new HttpError(500, "INTERNAL_ERROR", "Something went wrong"),
        rateHeaders,
      );
    }
  };
}
