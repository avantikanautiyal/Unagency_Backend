/**
 * S3-compatible blob storage abstraction (in-process).
 */

import { failure, success, type Result } from "../../intelligence/shared/result";
import { NotFoundError } from "../../intelligence/shared/errors";
import type { IBlobStorage } from "../interfaces";

export class InMemoryBlobStorage implements IBlobStorage {
  private readonly blobs = new Map<string, { data: string; contentType?: string }>();

  async put(
    key: string,
    data: Uint8Array | string,
    contentType?: string
  ): Promise<Result<{ key: string; size: number }>> {
    const text = typeof data === "string" ? data : Buffer.from(data).toString("base64");
    this.blobs.set(key, { data: text, contentType });
    return success({ key, size: text.length });
  }

  async get(
    key: string
  ): Promise<Result<{ key: string; data: string; contentType?: string } | undefined>> {
    const b = this.blobs.get(key);
    if (!b) return success(undefined);
    return success({ key, data: b.data, contentType: b.contentType });
  }

  async delete(key: string): Promise<Result<void>> {
    if (!this.blobs.has(key)) return failure(new NotFoundError("blob not found"));
    this.blobs.delete(key);
    return success(undefined);
  }
}
