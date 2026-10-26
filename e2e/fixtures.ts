import { expect, type Page } from "@playwright/test";
import { deflateSync } from "node:zlib";

/** A valid, solid-colour PNG generated in memory (no binary fixtures in the repo). */
export function solidPng(width = 64, height = 32, rgb: [number, number, number] = [47, 91, 234]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array(width).fill(rgb).flat())]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(Array(height).fill(row)))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export const textboxes = (page: Page) => page.getByRole("textbox", { name: "Widget text" });
export const widgets = (page: Page) => page.getByRole("article", { name: /widget$/ });
/** Exact match: a plain getByText("Saved") would also match "Unsaved changes". */
export const savedLabels = (page: Page) => widgets(page).getByText("Saved", { exact: true });
export const addText = (page: Page) => page.getByRole("button", { name: "+ Text" }).click();
export const addImage = (page: Page) => page.getByRole("button", { name: "+ Image" }).click();

/** Creates a pod from the dashboard and lands in its editor. Returns the editor URL. */
export async function createPod(page: Page, details?: { title?: string; buyer?: string }) {
  await page.goto("/");
  await page
    .getByRole("button", { name: /new pod|create your first pod/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/pods\/[0-9a-f-]{36}$/);
  if (details?.title) await page.getByRole("textbox", { name: "Pod title" }).fill(details.title);
  if (details?.buyer) {
    await page
      .getByRole("textbox", { name: "Prepared for (buyer or company)" })
      .fill(details.buyer);
  }
  return page.url();
}
