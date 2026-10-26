import { IMAGE_LIMITS, imageUrl, type UploadedImage } from "../domain/image";
import { sniffImageType } from "./image-sniffing";
import type { ImageStore, StoredImage } from "./image-store";
import { InvalidImageError, ParentPodNotFoundError } from "./widget-errors";
import type { PodLookupPort } from "./widget-service";

export type ImageServiceDeps = {
  store: ImageStore;
  pods: Pick<PodLookupPort, "exists">;
  clock?: () => Date;
  newId?: () => string;
};

export function createImageService({
  store,
  pods,
  clock = () => new Date(),
  newId = () => crypto.randomUUID(),
}: ImageServiceDeps) {
  return {
    /** Validates size and real format (magic bytes), then stores the image. */
    async upload(podId: string, data: Uint8Array): Promise<UploadedImage> {
      if (!(await pods.exists(podId))) throw new ParentPodNotFoundError(podId);
      if (data.byteLength === 0) throw new InvalidImageError("The file is empty", "missing");
      if (data.byteLength > IMAGE_LIMITS.maxBytes) {
        throw new InvalidImageError(
          `Images must be ${IMAGE_LIMITS.maxBytes / 1024 / 1024} MB or smaller`,
          "too_large",
        );
      }
      const contentType = sniffImageType(data);
      if (!contentType) {
        throw new InvalidImageError(
          "Only PNG, JPEG, GIF and WebP images are supported",
          "unsupported_type",
        );
      }

      const image: StoredImage = {
        id: newId(),
        podId,
        contentType,
        size: data.byteLength,
        createdAt: clock().toISOString(),
        data,
      };
      await store.put(image);
      return { id: image.id, url: imageUrl(image.id), contentType, size: image.size };
    },

    get: (imageId: string) => store.get(imageId),
  };
}

export type ImageService = ReturnType<typeof createImageService>;
