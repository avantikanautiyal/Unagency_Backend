/**
 * Provider-neutral durable media ingestion — URL, base64, existing blob refs.
 */

import { createHash } from "crypto";
import { failure, success, type Result } from "../../core/result";
import { ValidationError } from "../../core/errors";
import type { IBlobStorage } from "../../persistence/interfaces/persistence";
import type { DurableBlobRef } from "../contracts/durable-blob-ref";
import { validateIngestionUrl, validateRedirectUrl } from "./ssrf-guard";
import {
  DEFAULT_MEDIA_SIZE_LIMITS,
  inferMediaCategory,
  maxBytesForCategory,
  type MediaSizeLimits,
} from "./media-size-limits";
import { buildTenantBlobStorageKey } from "../blob/tenant-blob-key-builder";
import { BlobOwnershipRegistry } from "../blob/blob-ownership-registry";
import type { IBlobMetadataRepository } from "../blob/blob-metadata-repository";

export interface MediaIngestionInput {
  readonly organizationId: string;
  readonly executionId: string;
  readonly artifactId: string;
  readonly outputIndex: number;
  readonly temporaryUrl?: string;
  readonly base64?: string;
  readonly existingStorageRef?: string;
  readonly mimeType?: string;
}

export interface MediaDownloadClient {
  download(
    url: string,
    options: { maxBytes: number; timeoutMs: number }
  ): Promise<Result<{ data: Buffer; mimeType?: string }>>;
  /** Stream download — avoids buffering large video in memory. */
  downloadStream?(
    url: string,
    options: { maxBytes: number; timeoutMs: number }
  ): Promise<Result<{ stream: AsyncIterable<Uint8Array>; mimeType?: string }>>;
}

export class MediaIngestionService {
  constructor(
    private readonly blobs: IBlobStorage,
    private readonly ownership: BlobOwnershipRegistry | IBlobMetadataRepository,
    private readonly downloadClient: MediaDownloadClient,
    private readonly limits: MediaSizeLimits = DEFAULT_MEDIA_SIZE_LIMITS,
    private readonly nowIso: () => string = () => new Date().toISOString()
  ) {}

  private async resolveExistingRef(
    storageRef: string,
    organizationId: string
  ): Promise<
    | {
        storageKey: string;
        mimeType?: string;
        sizeBytes?: number;
        checksum?: string;
        createdAt?: string;
      }
    | undefined
  > {
    const key = storageRef.startsWith("blob:") ? storageRef.slice(5) : storageRef;
    if (this.ownership instanceof BlobOwnershipRegistry) {
      return this.ownership.resolveForTenant(key, organizationId);
    }
    return this.ownership.resolveForTenant(key, organizationId);
  }

  private async registerOwnership(record: {
    storageKey: string;
    organizationId: string;
    executionId: string;
    artifactId: string;
    mimeType: string;
    sizeBytes: number;
    checksum: string;
    createdAt: string;
  }): Promise<void> {
    if (this.ownership instanceof BlobOwnershipRegistry) {
      this.ownership.register(record);
      return;
    }
    await this.ownership.register(record);
  }

  async ingest(input: MediaIngestionInput): Promise<Result<DurableBlobRef>> {
    if (input.existingStorageRef) {
      const owned = await this.resolveExistingRef(input.existingStorageRef, input.organizationId);
      if (!owned) {
        return failure(new ValidationError("Existing storageRef not owned by tenant"));
      }
      return success({
        blobId: `blob_${input.artifactId}_${input.outputIndex}`,
        storageKey: owned.storageKey,
        organizationId: input.organizationId,
        mimeType: owned.mimeType ?? input.mimeType ?? "application/octet-stream",
        sizeBytes: owned.sizeBytes ?? 0,
        checksum: owned.checksum,
        createdAt: owned.createdAt ?? this.nowIso(),
      });
    }

    let buffer: Buffer;
    let mimeType = input.mimeType ?? "application/octet-stream";

    if (input.base64) {
      const decoded = this.decodeBase64Bounded(input.base64, mimeType);
      if (!decoded.ok) return decoded;
      buffer = decoded.value.buffer;
      mimeType = decoded.value.mimeType;
    } else if (input.temporaryUrl) {
      const category = inferMediaCategory(mimeType);
      const maxBytes = maxBytesForCategory(category, this.limits);
      const useStream =
        category === "video" &&
        typeof this.downloadClient.downloadStream === "function" &&
        typeof this.blobs.putStream === "function";

      if (useStream) {
        const streamed = await this.ingestFromStream({
          url: input.temporaryUrl,
          mimeType,
          maxBytes,
          storageKey: buildTenantBlobStorageKey({
            organizationId: input.organizationId,
            executionId: input.executionId,
            artifactId: input.artifactId ?? `art_${input.executionId}_${input.outputIndex}`,
            outputIndex: input.outputIndex,
            extension: mimeType.split("/")[1] ?? "bin",
          }),
          input,
        });
        if (!streamed.ok) return streamed;
        return success(streamed.value);
      }

      const fetched = await this.fetchTemporaryUrl(input.temporaryUrl, mimeType);
      if (!fetched.ok) return fetched;
      buffer = fetched.value.buffer;
      mimeType = fetched.value.mimeType;
    } else {
      return failure(new ValidationError("Media ingestion requires url, base64, or storageRef"));
    }

    const category = inferMediaCategory(mimeType);
    const maxBytes = maxBytesForCategory(category, this.limits);
    if (buffer.byteLength > maxBytes) {
      return failure(new ValidationError(`Media exceeds size limit for ${category}`));
    }

    const checksum = createHash("sha256").update(buffer).digest("hex");
    const ext = mimeType.split("/")[1] ?? "bin";
    const storageKey = buildTenantBlobStorageKey({
      organizationId: input.organizationId,
      executionId: input.executionId,
      artifactId: input.artifactId,
      outputIndex: input.outputIndex,
      extension: ext,
    });

    // M10.18 — artifact immutability: refuse overwrite when existing checksum differs
    const existingOwned = await this.resolveExistingRef(
      storageKey,
      input.organizationId
    );
    if (existingOwned?.checksum && existingOwned.checksum !== checksum) {
      return failure(
        new ValidationError(
          "Execution artifact blob is immutable — checksum conflict on storage key"
        )
      );
    }
    if (existingOwned?.checksum && existingOwned.checksum === checksum) {
      return success({
        blobId: `blob_${input.artifactId}_${input.outputIndex}`,
        storageKey,
        organizationId: input.organizationId,
        mimeType,
        sizeBytes: existingOwned.sizeBytes ?? buffer.byteLength,
        checksum,
        createdAt: existingOwned.createdAt ?? this.nowIso(),
      });
    }

    const put = await this.blobs.put(storageKey, buffer, mimeType);
    if (!put.ok) return put;

    const now = this.nowIso();
    await this.registerOwnership({
      storageKey,
      organizationId: input.organizationId,
      executionId: input.executionId,
      artifactId: input.artifactId,
      mimeType,
      sizeBytes: buffer.byteLength,
      checksum,
      createdAt: now,
    });

    return success({
      blobId: `blob_${input.artifactId}_${input.outputIndex}`,
      storageKey,
      organizationId: input.organizationId,
      mimeType,
      sizeBytes: buffer.byteLength,
      checksum,
      createdAt: now,
    });
  }

  private decodeBase64Bounded(
    base64: string,
    mimeType: string
  ): Result<{ buffer: Buffer; mimeType: string }> {
    const category = inferMediaCategory(mimeType);
    const maxBytes = maxBytesForCategory(category, this.limits);
    const estimated = Math.ceil((base64.length * 3) / 4);
    if (estimated > maxBytes) {
      return failure(new ValidationError("Base64 media exceeds size limit before decode"));
    }
    const buffer = Buffer.from(base64, "base64");
    if (buffer.byteLength > maxBytes) {
      return failure(new ValidationError("Decoded media exceeds size limit"));
    }
    return success({ buffer, mimeType });
  }

  private async fetchTemporaryUrl(
    url: string,
    declaredMime?: string
  ): Promise<Result<{ buffer: Buffer; mimeType: string }>> {
    const valid = validateIngestionUrl(url);
    if (!valid.ok) return valid;

    const downloaded = await this.downloadClient.download(String(valid.value), {
      maxBytes: maxBytesForCategory(inferMediaCategory(declaredMime), this.limits),
      timeoutMs: 30_000,
    });
    if (!downloaded.ok) return downloaded;

    return success({
      buffer: downloaded.value.data,
      mimeType: downloaded.value.mimeType ?? declaredMime ?? "application/octet-stream",
    });
  }

  private async ingestFromStream(input: {
    url: string;
    mimeType: string;
    maxBytes: number;
    storageKey: string;
    input: MediaIngestionInput;
  }): Promise<Result<DurableBlobRef>> {
    const valid = validateIngestionUrl(input.url);
    if (!valid.ok) return valid;

    const downloaded = await this.downloadClient.downloadStream!(String(valid.value), {
      maxBytes: input.maxBytes,
      timeoutMs: 30_000,
    });
    if (!downloaded.ok) return downloaded;

    const mimeType = downloaded.value.mimeType ?? input.mimeType;
    const put = await this.blobs.putStream!(input.storageKey, downloaded.value.stream, {
      contentType: mimeType,
      maxBytes: input.maxBytes,
    });
    if (!put.ok) return put;

    const now = this.nowIso();
    await this.registerOwnership({
      storageKey: input.storageKey,
      organizationId: input.input.organizationId,
      executionId: input.input.executionId,
      artifactId: input.input.artifactId,
      mimeType,
      sizeBytes: put.value.size,
      checksum: put.value.checksum ?? "",
      createdAt: now,
    });

    return success({
      blobId: `blob_${input.input.artifactId}_${input.input.outputIndex}`,
      storageKey: input.storageKey,
      organizationId: input.input.organizationId,
      mimeType,
      sizeBytes: put.value.size,
      checksum: put.value.checksum,
      createdAt: now,
    });
  }
}

/** Fake download client for tests — no network. */
export class FakeMediaDownloadClient implements MediaDownloadClient {
  constructor(
    private readonly responses: Record<
      string,
      { data: Buffer; mimeType?: string } | "redirect" | "error"
    > = {},
    private readonly redirectTarget?: string,
    private readonly defaultResponse?: { data: Buffer; mimeType?: string }
  ) {}

  async download(
    url: string,
    options: { maxBytes: number; timeoutMs: number }
  ): Promise<Result<{ data: Buffer; mimeType?: string }>> {
    const entry = this.responses[url];
    if (entry === "redirect" && this.redirectTarget) {
      const redirectCheck = validateRedirectUrl(url, this.redirectTarget);
      if (!redirectCheck.ok) return redirectCheck;
      return this.download(this.redirectTarget, options);
    }
    if (entry === "error") {
      return failure(new ValidationError("Fake download failed"));
    }
    const resolved =
      entry && entry !== "redirect"
        ? entry
        : this.defaultResponse ??
          (url.includes("cdn.example.test")
            ? { data: Buffer.from("fake-png"), mimeType: "image/png" }
            : undefined);
    if (!resolved) {
      return failure(new ValidationError("Fake download failed"));
    }
    if (resolved.data.byteLength > options.maxBytes) {
      return failure(new ValidationError("Download exceeded maxBytes"));
    }
    return success({ data: resolved.data, mimeType: resolved.mimeType });
  }

  async downloadStream(
    url: string,
    options: { maxBytes: number; timeoutMs: number }
  ): Promise<Result<{ stream: AsyncIterable<Uint8Array>; mimeType?: string }>> {
    const entry = this.responses[url];
    const resolved =
      entry && entry !== "redirect" && entry !== "error"
        ? entry
        : this.defaultResponse ??
          (url.includes("cdn.example.test")
            ? { data: Buffer.from("fake-video-chunk"), mimeType: "video/mp4" }
            : undefined);
    if (!resolved) {
      return failure(new ValidationError("Fake download stream failed"));
    }
    if (resolved.data.byteLength > options.maxBytes) {
      return failure(new ValidationError("Download exceeded maxBytes"));
    }
    async function* chunks(): AsyncIterable<Uint8Array> {
      const data = resolved!.data;
      const chunkSize = Math.max(1, Math.floor(data.byteLength / 4));
      for (let i = 0; i < data.byteLength; i += chunkSize) {
        yield data.subarray(i, i + chunkSize);
      }
    }
    return success({ stream: chunks(), mimeType: resolved!.mimeType });
  }
}

export { FetchMediaDownloadClient } from "./fetch-media-download-client";