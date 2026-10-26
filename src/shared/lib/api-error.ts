export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Network failures, timeouts, rate limits and server errors are worth retrying. */
  get retryable(): boolean {
    return this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

export function isRetryableError(error: unknown): boolean {
  return !(error instanceof ApiError) || error.retryable;
}

type ErrorBody = { error?: { code?: string; message?: string } };

/**
 * `fetch` that throws `ApiError` for network failures and non-2xx responses,
 * using the server's `{ error: { code, message } }` body when present.
 */
export async function requestJson<T>(
  fetchImpl: typeof fetch,
  path: string,
  init: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    const isForm = init.body instanceof FormData;
    response = await fetchImpl(path, {
      ...init,
      headers: isForm ? init.headers : { "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Network error, check your connection");
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ErrorBody | null;
    throw new ApiError(
      response.status,
      body?.error?.code ?? "UNKNOWN",
      body?.error?.message ?? response.statusText,
    );
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}

export const defaultFetch: typeof fetch = (...args) => fetch(...args);
