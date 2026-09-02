/**
 * Production S3 blob storage adapter — implements existing IBlobStorage.
 */

import { createHash } from "crypto";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { failure, success, type Result } from "../../core/result";
import { NotFoundError, ValidationError } from "../../core/errors";
import type { IBlobStorage } from "../interfaces/persistence";
import type { BlobStorageEnvConfig } from "./blob-storage-config";
import type {
  IMultipartBlobStorage,
  MultipartInitResult,
  MultipartPartResult,
} from "./multipart-blob-storage";

export type SignedGetUrlOptions = {
  disposition?: "inline" | "attachment";
  filename?: string;
  cacheControl?: string;
};

export class S3BlobStorage implements IBlobStorage, IMultipartBlobStorage {
  private readonly client: S3Client;

  constructor(private readonly config: BlobStorageEnvConfig) {
    this.client = new S3Client({
      region: config.region,
      credentials:
        config.accessKeyId && config.secretAccessKey
          ? {
              accessKeyId: config.accessKeyId,
              secretAccessKey: config.secretAccessKey,
            }
          : undefined,
    });
  }

  async put(
    key: string,
    data: Uint8Array | string,
    contentType?: string
  ): Promise<Result<{ key: string; size: number; checksum?: string }>> {
    const body = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
    const checksum = createHash("sha256").update(body).digest("hex");
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        })
      );
      return success({ key, size: body.byteLength, checksum });
    } catch (err) {
      return failure(
        new ValidationError(
          `S3 put failed: ${err instanceof Error ? err.message : String(err)}`
        )
      );
    }
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
    try {
      for await (const chunk of stream) {
        const buf = Buffer.from(chunk);
        size += buf.byteLength;
        if (size > maxBytes) {
          return failure(new ValidationError("Stream exceeds max upload size"));
        }
        hash.update(buf);
        chunks.push(buf);
      }
      const body = Buffer.concat(chunks);
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
          Body: body,
          ContentType: options?.contentType,
          ContentLength: body.byteLength,
        })
      );
      return success({ key, size: body.byteLength, checksum: hash.digest("hex") });
    } catch (err) {
      return failure(
        new ValidationError(
          `S3 putStream failed: ${err instanceof Error ? err.message : String(err)}`
        )
      );
    }
  }

  async get(
    key: string
  ): Promise<Result<{ key: string; data: string; contentType?: string } | undefined>> {
    try {
      const resp = await this.client.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: key })
      );
      if (!resp.Body) return success(undefined);
      const chunks: Buffer[] = [];
      const stream = resp.Body as AsyncIterable<Uint8Array>;
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
      const buf = Buffer.concat(chunks);
      return success({
        key,
        data: buf.toString("base64"),
        contentType: resp.ContentType,
      });
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name;
      if (name === "NoSuchKey" || name === "NotFound") return success(undefined);
      return failure(
        new ValidationError(
          `S3 get failed: ${err instanceof Error ? err.message : String(err)}`
        )
      );
    }
  }

  async delete(key: string): Promise<Result<void>> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key })
      );
      return success(undefined);
    } catch (err) {
      return failure(new NotFoundError(`S3 delete failed: ${String(err)}`));
    }
  }

  async createSignedGetUrl(
    key: string,
    ttlSeconds: number,
    options?: SignedGetUrlOptions
  ): Promise<Result<string>> {
    try {
      const disposition = options?.disposition ?? "inline";
      const filename = options?.filename?.replace(/["\\]/g, "_") || "file";
      const cmd = new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        ResponseContentDisposition: `${disposition}; filename="${filename}"`,
        ResponseCacheControl:
          options?.cacheControl ?? "private, max-age=300, must-revalidate",
      });
      const url = await getSignedUrl(
        this.client as unknown as Parameters<typeof getSignedUrl>[0],
        cmd as Parameters<typeof getSignedUrl>[1],
        { expiresIn: ttlSeconds }
      );
      return success(url);
    } catch (err) {
      return failure(
        new ValidationError(
          `S3 signed URL failed: ${err instanceof Error ? err.message : String(err)}`
        )
      );
    }
  }

  async createMultipartUpload(
    key: string,
    contentType?: string
  ): Promise<Result<MultipartInitResult>> {
    try {
      const resp = await this.client.send(
        new CreateMultipartUploadCommand({
          Bucket: this.config.bucket,
          Key: key,
          ContentType: contentType,
        })
      );
      if (!resp.UploadId) {
        return failure(new ValidationError("S3 multipart init missing UploadId"));
      }
      return success({ uploadId: resp.UploadId, key });
    } catch (err) {
      return failure(
        new ValidationError(
          `S3 createMultipartUpload failed: ${err instanceof Error ? err.message : String(err)}`
        )
      );
    }
  }

  async uploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    body: Uint8Array
  ): Promise<Result<MultipartPartResult>> {
    try {
      const resp = await this.client.send(
        new UploadPartCommand({
          Bucket: this.config.bucket,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
          Body: Buffer.from(body),
        })
      );
      if (!resp.ETag) {
        return failure(new ValidationError("S3 uploadPart missing ETag"));
      }
      return success({ partNumber, etag: resp.ETag });
    } catch (err) {
      return failure(
        new ValidationError(
          `S3 uploadPart failed: ${err instanceof Error ? err.message : String(err)}`
        )
      );
    }
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: readonly { partNumber: number; etag: string }[]
  ): Promise<Result<{ key: string; size: number; checksum?: string }>> {
    try {
      await this.client.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.config.bucket,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: {
            Parts: parts
              .slice()
              .sort((a, b) => a.partNumber - b.partNumber)
              .map((p) => ({ ETag: p.etag, PartNumber: p.partNumber })),
          },
        })
      );
      // Size/checksum unknown without HeadObject — return key only
      return success({ key, size: 0 });
    } catch (err) {
      return failure(
        new ValidationError(
          `S3 completeMultipartUpload failed: ${err instanceof Error ? err.message : String(err)}`
        )
      );
    }
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<Result<void>> {
    try {
      await this.client.send(
        new AbortMultipartUploadCommand({
          Bucket: this.config.bucket,
          Key: key,
          UploadId: uploadId,
        })
      );
      return success(undefined);
    } catch (err) {
      return failure(
        new ValidationError(
          `S3 abortMultipartUpload failed: ${err instanceof Error ? err.message : String(err)}`
        )
      );
    }
  }

  async createSignedUploadPartUrl(
    key: string,
    uploadId: string,
    partNumber: number,
    ttlSeconds: number
  ): Promise<Result<string>> {
    try {
      const url = await getSignedUrl(
        this.client as unknown as Parameters<typeof getSignedUrl>[0],
        new UploadPartCommand({
          Bucket: this.config.bucket,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
        }) as Parameters<typeof getSignedUrl>[1],
        { expiresIn: ttlSeconds }
      );
      return success(url);
    } catch (err) {
      return failure(
        new ValidationError(
          `S3 signed part URL failed: ${err instanceof Error ? err.message : String(err)}`
        )
      );
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
      return true;
    } catch {
      return false;
    }
  }

  bucketName(): string {
    return this.config.bucket;
  }
}

/** Test double — records puts without network. */
export class RecordingS3BlobStorage implements IBlobStorage, IMultipartBlobStorage {
  readonly objects = new Map<string, { data: Buffer; contentType?: string }>();
  readonly multipart = new Map<
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
    this.objects.set(key, { data: buf, contentType });
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
    const data = Buffer.concat(chunks);
    this.objects.set(key, { data, contentType: options?.contentType });
    return success({ key, size: data.byteLength, checksum: hash.digest("hex") });
  }

  async get(
    key: string
  ): Promise<Result<{ key: string; data: string; contentType?: string } | undefined>> {
    const obj = this.objects.get(key);
    if (!obj) return success(undefined);
    return success({ key, data: obj.data.toString("base64"), contentType: obj.contentType });
  }

  async delete(key: string): Promise<Result<void>> {
    this.objects.delete(key);
    return success(undefined);
  }

  createSignedGetUrl(
    key: string,
    _ttlSeconds: number,
    _options?: SignedGetUrlOptions
  ): Promise<Result<string>> {
    if (!this.objects.has(key)) {
      return Promise.resolve(failure(new NotFoundError("object not found")));
    }
    return Promise.resolve(success(`https://signed.test/${encodeURIComponent(key)}`));
  }

  async createMultipartUpload(
    key: string,
    contentType?: string
  ): Promise<Result<MultipartInitResult>> {
    const uploadId = `mpu_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
    this.objects.set(key, { data, contentType: session.contentType });
    this.multipart.delete(uploadId);
    return success({ key, size: data.byteLength, checksum });
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<Result<void>> {
    const session = this.multipart.get(uploadId);
    if (session && session.key === key) this.multipart.delete(uploadId);
    return success(undefined);
  }

  ping(): Promise<boolean> {
    return Promise.resolve(true);
  }
}
