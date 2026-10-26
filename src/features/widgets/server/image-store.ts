import type { Redis } from "@upstash/redis";
import type { ImageContentType } from "../domain/image";

export type StoredImage = {
  id: string;
  podId: string;
  contentType: ImageContentType;
  size: number;
  createdAt: string;
  data: Uint8Array;
};

/** Binary storage port for uploaded images, indexed by pod for cleanup. */
export interface ImageStore {
  put(image: StoredImage): Promise<void>;
  get(imageId: string): Promise<StoredImage | null>;
  delete(imageId: string): Promise<void>;
  deleteByPod(podId: string): Promise<void>;
}

export class MemoryImageStore implements ImageStore {
  private readonly images = new Map<string, StoredImage>();
  private readonly byPod = new Map<string, Set<string>>();

  async put(image: StoredImage): Promise<void> {
    this.images.set(image.id, image);
    let ids = this.byPod.get(image.podId);
    if (!ids) {
      ids = new Set();
      this.byPod.set(image.podId, ids);
    }
    ids.add(image.id);
  }

  async get(imageId: string): Promise<StoredImage | null> {
    return this.images.get(imageId) ?? null;
  }

  async delete(imageId: string): Promise<void> {
    const image = this.images.get(imageId);
    if (!image) return;
    this.images.delete(imageId);
    this.byPod.get(image.podId)?.delete(imageId);
  }

  async deleteByPod(podId: string): Promise<void> {
    for (const id of this.byPod.get(podId) ?? []) this.images.delete(id);
    this.byPod.delete(podId);
  }
}

/**
 * Redis layout: `image:{id}` hash (metadata + base64 data) and a
 * `pod:{podId}:images` set used to delete everything when a pod goes away.
 * Base64 inflates size by a third; fine for 2 MB images, and object storage
 * would be the next step at scale.
 */
export class RedisImageStore implements ImageStore {
  constructor(
    private readonly redis: Redis,
    private readonly keyPrefix = "",
  ) {}

  async put(image: StoredImage): Promise<void> {
    const tx = this.redis.multi();
    tx.hset(this.imageKey(image.id), {
      podId: image.podId,
      contentType: image.contentType,
      size: String(image.size),
      createdAt: image.createdAt,
      data: Buffer.from(image.data).toString("base64"),
    });
    tx.sadd(this.podKey(image.podId), image.id);
    await tx.exec();
  }

  async get(imageId: string): Promise<StoredImage | null> {
    const hash = await this.redis.hgetall<Record<string, string>>(this.imageKey(imageId));
    if (!hash?.data) return null;
    return {
      id: imageId,
      podId: hash.podId,
      contentType: hash.contentType as ImageContentType,
      size: Number(hash.size),
      createdAt: hash.createdAt,
      data: new Uint8Array(Buffer.from(hash.data, "base64")),
    };
  }

  async delete(imageId: string): Promise<void> {
    const podId = await this.redis.hget<string>(this.imageKey(imageId), "podId");
    const tx = this.redis.multi();
    tx.del(this.imageKey(imageId));
    if (podId) tx.srem(this.podKey(podId), imageId);
    await tx.exec();
  }

  async deleteByPod(podId: string): Promise<void> {
    const ids = await this.redis.smembers(this.podKey(podId));
    const tx = this.redis.multi();
    for (const id of ids) tx.del(this.imageKey(id));
    tx.del(this.podKey(podId));
    await tx.exec();
  }

  private imageKey(imageId: string) {
    return `${this.keyPrefix}image:${imageId}`;
  }

  private podKey(podId: string) {
    return `${this.keyPrefix}pod:${podId}:images`;
  }
}
