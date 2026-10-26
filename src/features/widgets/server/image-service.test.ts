import { describe, expect, it } from "vitest";
import { PNG_BYTES } from "@test/fixtures";
import { IMAGE_LIMITS } from "../domain/image";
import { createImageService } from "./image-service";
import { sniffImageType } from "./image-sniffing";
import { MemoryImageStore } from "./image-store";
import { InvalidImageError, ParentPodNotFoundError } from "./widget-errors";
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

describe("sniffImageType", () => {
  it.each([
    ["image/png", PNG_BYTES],
    ["image/jpeg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0])],
    ["image/gif", new Uint8Array(ascii("GIF89a..."))],
    ["image/webp", new Uint8Array([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBPVP8 ")])],
  ])("detects %s from magic bytes", (type, bytes) => {
    expect(sniffImageType(bytes)).toBe(type);
  });

  it.each([
    ["SVG (scriptable)", new Uint8Array(ascii('<svg xmlns="http://www.w3.org/2000/svg">'))],
    ["HTML", new Uint8Array(ascii("<!doctype html>"))],
    ["empty", new Uint8Array()],
  ])("rejects %s", (_label, bytes) => {
    expect(sniffImageType(bytes)).toBeNull();
  });
});

describe("image service", () => {
  const podId = crypto.randomUUID();
  const setup = (exists = true) => {
    const store = new MemoryImageStore();
    return { store, service: createImageService({ store, pods: { exists: async () => exists } }) };
  };

  it("stores a valid image and returns its public URL", async () => {
    const { store, service } = setup();
    const uploaded = await service.upload(podId, PNG_BYTES);

    expect(uploaded).toEqual({
      id: expect.any(String),
      url: `/api/images/${uploaded.id}`,
      contentType: "image/png",
      size: PNG_BYTES.byteLength,
    });
    expect((await store.get(uploaded.id))?.podId).toBe(podId);
  });

  it("rejects files whose bytes are not a supported image, whatever their name", async () => {
    const { service } = setup();
    await expect(
      service.upload(podId, new Uint8Array(ascii("<svg onload=alert(1)>"))),
    ).rejects.toMatchObject({ reason: "unsupported_type" });
  });

  it("rejects files over the size limit", async () => {
    const { service } = setup();
    const huge = new Uint8Array(IMAGE_LIMITS.maxBytes + 1);
    huge.set(PNG_BYTES);
    await expect(service.upload(podId, huge)).rejects.toMatchObject({ reason: "too_large" });
  });

  it("rejects empty files", async () => {
    const { service } = setup();
    await expect(service.upload(podId, new Uint8Array())).rejects.toBeInstanceOf(InvalidImageError);
  });

  it("refuses uploads for pods that do not exist", async () => {
    const { service } = setup(false);
    await expect(service.upload(podId, PNG_BYTES)).rejects.toBeInstanceOf(ParentPodNotFoundError);
  });
});
