/**
 * S3-compatible blob storage abstraction (in-process).
 */

import { createHash } from "crypto";
import { failure, success, type Result } from "../../core/result";
import { NotFoundError, ValidationError } from "../../core/errors";
import type { IBlobStorage } from "../interfaces";
import type {
  IMultipartBlobStorage,
  MultipartInitResult,
  MultipartPartResult,
} from "./multipart-blob-storage";

export class InMemoryBlobStorage implements IBlobStorage, IMultipartBlobStorage {
  private readonly blobs = new Map<string, { data: string; contentType?: string }>();
  private readonly multipart = new Map<
    string,
    { key: string; parts: Map<number, Buffer>; contentType?: string }
  >();

  async put(
    key: string,
    data: Uint8Array | string,
    contentType?: string
  ): Promise<Result<{ key: string; size: number; checksum?: string }>> {
    const buf = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
    const checksum = createHash("sha256").update(buf).digest("hex");
    const text = buf.toString("base64");
    this.blobs.set(key, { data: text, contentType });
    return success({ key, size: buf.byteLength, checksum });
  }

  async putStream(
    key: string,
    stream: AsyncIterable<Uint8Array>,
    options?: { contentType?: string; maxBytes?: number }
  ): Promise<Result<{ key: string; size: number; checksum?: string }>> {
    const maxBytes = options?.maxBytes ?? 512 * 1024 * 1024;
    const hash = createHash("sha256");
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      const buf = Buffer.from(chunk);
      size += buf.byteLength;
      if (size > maxBytes) {
        return failure(new ValidationError("Stream exceeds max upload size"));
      }
      hash.update(buf);
      chunks.push(buf);
    }
    const data = Buffer.concat(chunks).toString("base64");
    this.blobs.set(key, { data, contentType: options?.contentType });
    return success({ key, size, checksum: hash.digest("hex") });
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

  async createMultipartUpload(
    key: string,
    contentType?: string
  ): Promise<Result<MultipartInitResult>> {
    const uploadId = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.multipart.set(uploadId, { key, parts: new Map(), contentType });
    return success({ uploadId, key });
  }

  async uploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    body: Uint8Array
  ): Promise<Result<MultipartPartResult>> {
    const session = this.multipart.get(uploadId);
    if (!session || session.key !== key) {
      return failure(new ValidationError("multipart session not found"));
    }
    const buf = Buffer.from(body);
    session.parts.set(partNumber, buf);
    const etag = `"${createHash("md5").update(buf).digest("hex")}"`;
    return success({ partNumber, etag });
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: readonly { partNumber: number; etag: string }[]
  ): Promise<Result<{ key: string; size: number; checksum?: string }>> {
    const session = this.multipart.get(uploadId);
    if (!session || session.key !== key) {
      return failure(new ValidationError("multipart session not found"));
    }
    const ordered = parts
      .slice()
      .sort((a, b) => a.partNumber - b.partNumber)
      .map((p) => session.parts.get(p.partNumber))
      .filter((b): b is Buffer => !!b);
    const data = Buffer.concat(ordered);
    const checksum = createHash("sha256").update(data).digest("hex");
    this.blobs.set(key, {
      data: data.toString("base64"),
      contentType: session.contentType,
    });
    this.multipart.delete(uploadId);
    return success({ key, size: data.byteLength, checksum });
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<Result<void>> {
    const session = this.multipart.get(uploadId);
    if (session && session.key === key) this.multipart.delete(uploadId);
    return success(undefined);
  }
}
