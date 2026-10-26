import type { ImageContentType } from "../domain/image";

/**
 * Detects the real image format from the file's magic bytes. The browser's
 * declared MIME type and the file extension are user-controlled, so neither
 * is trusted.
 */
export function sniffImageType(bytes: Uint8Array): ImageContentType | null {
  const startsWith = (signature: number[], offset = 0) =>
    signature.every((byte, i) => bytes[offset + i] === byte);
  const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(ascii("GIF87a")) || startsWith(ascii("GIF89a"))) return "image/gif";
  if (startsWith(ascii("RIFF")) && startsWith(ascii("WEBP"), 8)) return "image/webp";
  return null;
}
