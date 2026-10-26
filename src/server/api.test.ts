import { beforeEach, describe, expect, it, vi } from "vitest";
import { PNG_BYTES } from "@test/fixtures";
import { MemoryPodRepository } from "@/features/pods/server/memory-pod-repository";
import type { Pod } from "@/features/pods/domain/pod";
import { MemoryImageStore } from "@/features/widgets/server/image-store";
import { MemoryWidgetRepository } from "@/features/widgets/server/memory-widget-repository";
import { WIDGET_LIMITS, type Widget } from "@/features/widgets/domain/widget";
import { createMemoryRateLimiter, type RateLimiter } from "@/shared/server/rate-limit";
import { createContainer, type Container } from "./container";

/**
 * API integration tests: real handlers, services and in-memory adapters wired
 * by the production composition root, exercised with plain Requests.
 */

const BASE = "http://localhost/api";

function request(method: string, path: string, body?: unknown, headers: HeadersInit = {}) {
  const isForm = body instanceof FormData;
  return new Request(`${BASE}${path}`, {
    method,
    headers: isForm ? headers : { "content-type": "application/json", ...headers },
    body:
      body === undefined
        ? undefined
        : isForm || typeof body === "string"
          ? (body as BodyInit)
          : JSON.stringify(body),
  });
}

describe("API", () => {
  let app: Container;
  let pod: Pod;

  function setup(
    rateLimiter: RateLimiter = createMemoryRateLimiter({ limit: 10_000, windowMs: 60_000 }),
  ) {
    vi.spyOn(console, "error").mockImplementation(() => {});
    app = createContainer({
      storage: "memory",
      pods: new MemoryPodRepository(),
      widgets: new MemoryWidgetRepository(),
      images: new MemoryImageStore(),
      rateLimiter,
    });
  }

  const http = () => app.http;
  const createPod = async (body: unknown = {}) => {
    const response = await http().pods.create(request("POST", "/pods", body));
    return { response, pod: response.status === 201 ? ((await response.json()).pod as Pod) : null };
  };
  const putWidget = (id = crypto.randomUUID(), body: unknown = {}, podId = pod.id) =>
    http().widgets.create(request("PUT", `/pods/${podId}/widgets/${id}`, body), {
      podId,
      widgetId: id,
    });
  const patchWidget = (id: string, body: unknown) =>
    http().widgets.update(request("PATCH", `/pods/${pod.id}/widgets/${id}`, body), {
      podId: pod.id,
      widgetId: id,
    });
  const listWidgets = async (podId = pod.id): Promise<Widget[]> =>
    (await (await http().widgets.list(request("GET", `/pods/${podId}/widgets`), { podId })).json())
      .widgets;
  const upload = (file: Blob, podId = pod.id) => {
    const form = new FormData();
    form.set("file", file, "photo.png");
    return http().widgets.uploadImage(request("POST", `/pods/${podId}/images`, form), { podId });
  };

  beforeEach(async () => {
    setup();
    pod = (await createPod({ title: "Acme", buyerName: "Acme Inc." })).pod!;
  });

  describe("pods", () => {
    it("creates, lists, updates and fetches pods", async () => {
      const list = await http().pods.list(request("GET", "/pods"));
      expect(list.headers.get("cache-control")).toBe("no-store");
      expect((await list.json()).pods).toEqual([
        expect.objectContaining({ id: pod.id, title: "Acme", widgetCount: 0, viewCount: 0 }),
      ]);

      const updated = await http().pods.update(
        request("PATCH", `/pods/${pod.id}`, { title: "Acme renewal" }),
        { podId: pod.id },
      );
      expect((await updated.json()).pod.title).toBe("Acme renewal");

      const fetched = await http().pods.get(request("GET", `/pods/${pod.id}`), { podId: pod.id });
      expect((await fetched.json()).pod).toMatchObject({
        title: "Acme renewal",
        buyerName: "Acme Inc.",
      });
    });

    it("counts buyer views through the beacon endpoint, without revealing unknown links", async () => {
      const beacon = (shareId: string) =>
        http().pods.recordView(request("POST", `/share/${shareId}/views`), { shareId });

      expect((await beacon(pod.shareId)).status).toBe(204);
      expect((await beacon(pod.shareId)).status).toBe(204);
      expect((await beacon(crypto.randomUUID())).status).toBe(204); // unknown: same answer

      expect(await app.pods.getStats(pod.id)).toMatchObject({ viewCount: 2 });
    });

    it("validates pod input", async () => {
      expect((await createPod({ title: "x".repeat(121) })).response.status).toBe(400);
      const empty = await http().pods.update(request("PATCH", `/pods/${pod.id}`, {}), {
        podId: pod.id,
      });
      expect(empty.status).toBe(400);
    });

    it("returns 404 for unknown pods", async () => {
      const podId = crypto.randomUUID();
      const response = await http().pods.get(request("GET", `/pods/${podId}`), { podId });
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe("POD_NOT_FOUND");
    });

    it("duplicates a pod with all widgets and images", async () => {
      const imageRes = await upload(new Blob([PNG_BYTES], { type: "image/png" }));
      const { image } = await imageRes.json();
      await putWidget(crypto.randomUUID(), { type: "text", content: "Hello" });
      await putWidget(crypto.randomUUID(), { type: "image", imageId: image.id, alt: "Logo" });

      const response = await http().pods.duplicate(request("POST", `/pods/${pod.id}/duplicate`), {
        podId: pod.id,
      });
      expect(response.status).toBe(201);
      const copy: Pod = (await response.json()).pod;

      const widgets = await listWidgets(copy.id);
      expect(widgets.map((w) => w.type)).toEqual(["text", "image"]);
      const copiedImage = widgets[1].type === "image" ? widgets[1].imageId : null;
      expect(copiedImage).not.toBe(image.id);
      expect(
        (await http().widgets.getImage(request("GET", "/"), { imageId: copiedImage! })).status,
      ).toBe(200);
    });

    it("deleting a pod removes its widgets, images and share link", async () => {
      const { image } = await (await upload(new Blob([PNG_BYTES]))).json();
      await putWidget(crypto.randomUUID(), { type: "image", imageId: image.id });

      const response = await http().pods.remove(request("DELETE", `/pods/${pod.id}`), {
        podId: pod.id,
      });

      expect(response.status).toBe(204);
      expect(await listWidgets()).toEqual([]);
      expect(await app.pods.getByShareId(pod.shareId)).toBeNull();
      expect(
        (await http().widgets.getImage(request("GET", "/"), { imageId: image.id })).status,
      ).toBe(404);
    });
  });

  describe("widgets", () => {
    it("PUT creates (201) and repeating it is idempotent (200)", async () => {
      const id = crypto.randomUUID();
      const first = await putWidget(id);
      expect(first.status).toBe(201);
      const { widget } = await first.json();
      expect(widget).toMatchObject({ id, type: "text", content: "" });

      const second = await putWidget(id);
      expect(second.status).toBe(200);
      expect((await second.json()).widget).toEqual(widget);
      expect(await listWidgets()).toHaveLength(1);
    });

    it("refuses widgets for a pod that does not exist", async () => {
      const response = await putWidget(crypto.randomUUID(), {}, crypto.randomUUID());
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe("POD_NOT_FOUND");
    });

    it("PATCH persists content, which a subsequent GET returns", async () => {
      const id = crypto.randomUUID();
      await putWidget(id);
      expect((await patchWidget(id, { content: "Hello pod" })).status).toBe(200);
      expect(await listWidgets()).toEqual([expect.objectContaining({ content: "Hello pod" })]);
    });

    it("reorders widgets via position", async () => {
      const [a, b] = [crypto.randomUUID(), crypto.randomUUID()];
      await putWidget(a);
      await putWidget(b);
      await patchWidget(b, { position: "Zz" });
      expect((await listWidgets()).map((w) => w.id)).toEqual([b, a]);
    });

    it("accepts content at the 10,000 character limit and rejects one more", async () => {
      const id = crypto.randomUUID();
      await putWidget(id);
      const max = WIDGET_LIMITS.maxContentLength;
      expect((await patchWidget(id, { content: "a".repeat(max) })).status).toBe(200);
      const over = await patchWidget(id, { content: "a".repeat(max + 1) });
      expect(over.status).toBe(400);
      expect((await over.json()).error.code).toBe("VALIDATION_ERROR");
    });

    it.each([
      ["missing fields", {}],
      ["non-string content", { content: 42 }],
      ["a field of another widget type", { alt: "nope" }],
      ["an invalid position", { position: "not a key!" }],
    ])("rejects %s", async (_label, body) => {
      const id = crypto.randomUUID();
      await putWidget(id);
      expect((await patchWidget(id, body)).status).toBe(400);
    });

    it("rejects malformed JSON and oversized bodies", async () => {
      const id = crypto.randomUUID();
      await putWidget(id);
      expect((await patchWidget(id, "{not json")).status).toBe(400);
      expect((await patchWidget(id, { content: "a".repeat(70_000) })).status).toBe(413);
    });

    it("rejects invalid ids", async () => {
      const response = await http().widgets.list(request("GET", "/pods/nope/widgets"), {
        podId: "nope",
      });
      expect(response.status).toBe(400);
      expect((await putWidget("not-a-uuid")).status).toBe(400);
    });

    it("PATCH on a missing widget returns 404", async () => {
      const response = await patchWidget(crypto.randomUUID(), { content: "orphan" });
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe("NOT_FOUND");
    });

    it("DELETE returns 204 and is idempotent", async () => {
      const widgetId = crypto.randomUUID();
      await putWidget(widgetId);
      const remove = () =>
        http().widgets.remove(request("DELETE", `/pods/${pod.id}/widgets/${widgetId}`), {
          podId: pod.id,
          widgetId,
        });
      expect((await remove()).status).toBe(204);
      expect((await remove()).status).toBe(204);
      expect(await listWidgets()).toEqual([]);
    });

    it("returns 409 when the pod is full", async () => {
      for (let i = 0; i < WIDGET_LIMITS.maxWidgetsPerPod; i++) await putWidget();
      const response = await putWidget();
      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe("WIDGET_LIMIT_REACHED");
    });
  });

  describe("images", () => {
    it("uploads an image and serves it with immutable caching and safe headers", async () => {
      const response = await upload(new Blob([PNG_BYTES], { type: "image/png" }));
      expect(response.status).toBe(201);
      const { image } = await response.json();
      expect(image.url).toBe(`/api/images/${image.id}`);

      const served = await http().widgets.getImage(request("GET", image.url), {
        imageId: image.id,
      });
      expect(served.status).toBe(200);
      expect(served.headers.get("content-type")).toBe("image/png");
      expect(served.headers.get("cache-control")).toContain("immutable");
      expect(served.headers.get("x-content-type-options")).toBe("nosniff");
      expect(new Uint8Array(await served.arrayBuffer())).toEqual(PNG_BYTES);
    });

    it("rejects non-images even when they claim to be PNGs", async () => {
      const fake = new Blob(["<svg onload=alert(1)>"], { type: "image/png" });
      const response = await upload(fake);
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_IMAGE");
    });

    it("rejects uploads without a file", async () => {
      const response = await http().widgets.uploadImage(
        request("POST", `/pods/${pod.id}/images`, new FormData()),
        { podId: pod.id },
      );
      expect(response.status).toBe(400);
    });

    it("returns 404 for unknown images", async () => {
      const response = await http().widgets.getImage(request("GET", "/"), {
        imageId: crypto.randomUUID(),
      });
      expect(response.status).toBe(404);
    });
  });

  describe("cross-cutting", () => {
    it("rate limits per client IP with Retry-After", async () => {
      setup(createMemoryRateLimiter({ limit: 2, windowMs: 60_000 }));
      const fromIp = (ip: string) =>
        http().pods.list(request("GET", "/pods", undefined, { "x-forwarded-for": ip }));

      expect((await fromIp("1.1.1.1")).status).toBe(200);
      expect((await fromIp("1.1.1.1")).status).toBe(200);
      const limited = await fromIp("1.1.1.1");
      expect(limited.status).toBe(429);
      expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
      expect((await fromIp("2.2.2.2")).status).toBe(200);
    });

    it("hides internal errors behind a generic 500", async () => {
      vi.spyOn(app.pods, "list").mockRejectedValue(new Error("db exploded"));
      const response = await http().pods.list(request("GET", "/pods"));
      expect(response.status).toBe(500);
      expect(JSON.stringify(await response.json())).not.toContain("db exploded");
      expect(console.error).toHaveBeenCalled();
    });
  });
});
