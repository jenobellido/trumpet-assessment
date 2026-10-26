import { describe, expect, it, vi } from "vitest";
import { ApiError, createWidgetsApi, isRetryableError } from "./widgets-api";

const POD = "11111111-1111-4111-8111-111111111111";
const WIDGET = "22222222-2222-4222-8222-222222222222";

function mockFetch(response: Response | Error) {
  return vi.fn<typeof fetch>(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
}

describe("widgets API client", () => {
  it("creates a widget with an idempotent PUT", async () => {
    const widget = { id: WIDGET, type: "text", content: "" };
    const fetchImpl = mockFetch(Response.json({ widget }, { status: 201 }));
    const fields = { type: "text", position: "a0", content: "" } as const;

    await expect(createWidgetsApi(POD, fetchImpl).create(WIDGET, fields)).resolves.toEqual(widget);

    expect(fetchImpl).toHaveBeenCalledWith(
      `/api/pods/${POD}/widgets/${WIDGET}`,
      expect.objectContaining({ method: "PUT", body: JSON.stringify(fields) }),
    );
  });

  it("sends partial updates with PATCH and forwards keepalive", async () => {
    const fetchImpl = mockFetch(Response.json({ widget: {} }));

    await createWidgetsApi(POD, fetchImpl).update(
      WIDGET,
      { content: "hello" },
      { keepalive: true },
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      `/api/pods/${POD}/widgets/${WIDGET}`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ content: "hello" }),
        keepalive: true,
      }),
    );
  });

  it("uploads images as multipart form data, without forcing a JSON content type", async () => {
    const image = { id: "img", url: "/api/images/img", contentType: "image/png", size: 3 };
    const fetchImpl = mockFetch(Response.json({ image }, { status: 201 }));
    const file = new File([new Uint8Array([1, 2, 3])], "logo.png", { type: "image/png" });

    await expect(createWidgetsApi(POD, fetchImpl).uploadImage(file)).resolves.toEqual(image);

    const [path, init] = fetchImpl.mock.calls[0];
    expect(path).toBe(`/api/pods/${POD}/images`);
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).get("file")).toBeInstanceOf(File);
    expect(init?.headers).toBeUndefined();
  });

  it("handles 204 responses on delete", async () => {
    const fetchImpl = mockFetch(new Response(null, { status: 204 }));
    await expect(createWidgetsApi(POD, fetchImpl).remove(WIDGET)).resolves.toBeUndefined();
  });

  it("maps error responses to ApiError with the server's code and message", async () => {
    const body = { error: { code: "NOT_FOUND", message: "Widget gone" } };
    const fetchImpl = mockFetch(Response.json(body, { status: 404 }));

    const error = await createWidgetsApi(POD, fetchImpl)
      .update(WIDGET, { content: "x" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, code: "NOT_FOUND", message: "Widget gone" });
    expect(isRetryableError(error)).toBe(false);
  });

  it("maps network failures to a retryable ApiError", async () => {
    const fetchImpl = mockFetch(new TypeError("Failed to fetch"));
    const error = await createWidgetsApi(POD, fetchImpl)
      .list()
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 0, code: "NETWORK_ERROR" });
    expect(isRetryableError(error)).toBe(true);
  });

  it.each([
    [500, true],
    [503, true],
    [429, true],
    [408, true],
    [400, false],
    [409, false],
  ])("status %i retryable: %s", (status, retryable) => {
    expect(new ApiError(status, "X", "x").retryable).toBe(retryable);
  });
});
