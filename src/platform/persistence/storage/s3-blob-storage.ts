/**
 * Production S3 blob storage adapter — implements existing IBlobStorage.
 */

import { createHash } from "crypto";
import { PassThrough } from "stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { failure, success, type Result } from "../../intelligence/shared/result";
import { NotFoundError, ValidationError } from "../../intelligence/shared/errors";
import type { IBlobStorage } from "../interfaces/persistence";
import type { BlobStorageEnvConfig } from "./blob-storage-config";

export class S3BlobStorage implements IBlobStorage {
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
  ): Promise<Result<{ key: string; size: number }>> {
    const body = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        })
      );
      return success({ key, size: body.byteLength });
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
    const pass = new PassThrough();

    void (async () => {
      try {
        for await (const chunk of stream) {
          const buf = Buffer.from(chunk);
          size += buf.byteLength;
          if (size > maxBytes) {
            pass.destroy(new ValidationError("Stream exceeds max upload size"));
            return;
          }
          hash.update(buf);
          if (!pass.write(buf)) {
            await new Promise<void>((resolve) => pass.once("drain", resolve));
          }
        }
        pass.end();
      } catch (err) {
        pass.destroy(err instanceof Error ? err : new Error(String(err)));
      }
    })();

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
          Body: pass,
          ContentType: options?.contentType,
        })
      );
      return success({ key, size, checksum: hash.digest("hex") });
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

  async createSignedGetUrl(key: string, ttlSeconds: number): Promise<Result<string>> {
    try {
      const url = await getSignedUrl(
        this.client as unknown as Parameters<typeof getSignedUrl>[0],
        new GetObjectCommand({ Bucket: this.config.bucket, Key: key }) as Parameters<
          typeof getSignedUrl
        >[1],
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
export class RecordingS3BlobStorage implements IBlobStorage {
  readonly objects = new Map<string, { data: Buffer; contentType?: string }>();

  async put(
    key: string,
    data: Uint8Array | string,
    contentType?: string
  ): Promise<Result<{ key: string; size: number }>> {
    const buf = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
    this.objects.set(key, { data: buf, contentType });
    return success({ key, size: buf.byteLength });
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

  createSignedGetUrl(key: string, _ttlSeconds: number): Promise<Result<string>> {
    if (!this.objects.has(key)) {
      return Promise.resolve(failure(new NotFoundError("object not found")));
    }
    return Promise.resolve(success(`https://signed.test/${encodeURIComponent(key)}`));
  }

  ping(): Promise<boolean> {
    return Promise.resolve(true);
  }
}
