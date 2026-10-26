export const IMAGE_LIMITS = {
  maxBytes: 2 * 1024 * 1024,
  /** Raster formats only: SVG can carry scripts, so it is not accepted. */
  contentTypes: ["image/png", "image/jpeg", "image/gif", "image/webp"],
} as const;

export type ImageContentType = (typeof IMAGE_LIMITS.contentTypes)[number];

export type UploadedImage = {
  id: string;
  url: string;
  contentType: ImageContentType;
  size: number;
};

/**
 * Public URL of an image. Deliberately keyed by image id only, so a buyer
 * page never exposes the pod's (editable) id.
 */
export function imageUrl(imageId: string): string {
  return `/api/images/${imageId}`;
}

export function imagesUploadPath(podId: string): string {
  return `/api/pods/${podId}/images`;
}
