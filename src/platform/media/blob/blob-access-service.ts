/**
 * Tenant-authoritative blob access — never trust client-supplied organizationId.
 */

import { createHash } from "node:crypto";
import { failure, success, type Result } from "../../core/result";
import { ValidationError } from "../../core/errors";
import { BlobOwnershipRegistry } from "./blob-ownership-registry";
import type { IBlobMetadataRepository } from "./blob-metadata-repository";
import type {
  S3BlobStorage,
  RecordingS3BlobStorage,
  SignedGetUrlOptions,
} from "../../persistence/storage/s3-blob-storage";
import { parseStorageRefKey } from "./tenant-blob-key-builder";

export interface ResolvedBlobAsset {
  readonly storageKey: string;
  readonly organizationId: string;
  readonly mimeType?: string;
  readonly executionId?: string;
}

export interface SignedBlobAccess {
  readonly storageKey: string;
  readonly organizationId: string;
  readonly signedUrl: string;
  readonly expiresInSeconds: number;
}

type SignableBlobStorage = S3BlobStorage | RecordingS3BlobStorage;

export class BlobAccessService {
  constructor(
    private readonly source:
      | BlobOwnershipRegistry
      | IBlobMetadataRepository,
    private readonly blobStorage?: SignableBlobStorage,
    private readonly signedUrlTtlSeconds = 300
  ) {}

  resolveForTenant(
    storageRef: string,
    tenantOrganizationId: string
  ): Result<ResolvedBlobAsset> {
    const key = parseStorageRefKey(storageRef);
    if (this.source instanceof BlobOwnershipRegistry) {
      const rec = this.source.resolveForTenant(key, tenantOrganizationId);
      if (!rec) {
        return failure(
          new ValidationError(
            "Blob not found or access denied — cross-tenant storage reference rejected"
          )
        );
      }
      return success({
        storageKey: rec.storageKey,
        organizationId: rec.organizationId,
        mimeType: rec.mimeType,
        executionId: rec.executionId,
      });
    }
    return failure(new ValidationError("Use resolveForTenantAsync for durable metadata repository"));
  }

  async resolveForTenantAsync(
    storageRef: string,
    tenantOrganizationId: string
  ): Promise<Result<ResolvedBlobAsset>> {
    const key = parseStorageRefKey(storageRef);
    if (this.source instanceof BlobOwnershipRegistry) {
      return this.resolveForTenant(storageRef, tenantOrganizationId);
    }
    const rec = await this.source.resolveForTenant(key, tenantOrganizationId);
    if (!rec) {
      return failure(
        new ValidationError(
          "Blob not found or access denied — cross-tenant storage reference rejected"
        )
      );
    }
    return success({
      storageKey: rec.storageKey,
      organizationId: rec.organizationId,
      mimeType: rec.mimeType,
      executionId: rec.executionId,
    });
  }

  /**
   * Store an inline (data:) image under the tenant's prefix and return a signed
   * URL, for providers that only accept http(s) image inputs.
   */
  async stageInlineProviderInput(input: {
    readonly dataUrl: string;
    readonly organizationId: string;
    readonly keyPrefix: string;
  }): Promise<Result<string>> {
    const match = /^data:([^;,]+);base64,(.+)$/i.exec(input.dataUrl.trim());
    if (!match) return failure(new ValidationError("Not a base64 data URL"));
    if (!this.blobStorage?.createSignedGetUrl) {
      return failure(new ValidationError("Signed URL not available for blob storage backend"));
    }
    const mimeType = match[1]!.toLowerCase();
    const bytes = Buffer.from(match[2]!, "base64");
    const ext = mimeType.split("/")[1]?.replace(/[^a-z0-9]/g, "") || "bin";
    const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 24);
    const key = `tenant/${input.organizationId}/${input.keyPrefix}/${digest}.${ext}`;
    const put = await this.blobStorage.put(key, bytes, mimeType);
    if (!put.ok) return put;
    // Vendors may queue before fetching inputs; outlive a short default TTL.
    return this.blobStorage.createSignedGetUrl(key, Math.max(this.signedUrlTtlSeconds, 3600));
  }

  async createProviderInputSignedUrl(
    storageRef: string,
    tenantOrganizationId: string,
    options?: SignedGetUrlOptions
  ): Promise<Result<SignedBlobAccess>> {
    const resolved = await this.resolveForTenantAsync(storageRef, tenantOrganizationId);
    if (!resolved.ok) return resolved;
    if (!this.blobStorage?.createSignedGetUrl) {
      return failure(new ValidationError("Signed URL not available for blob storage backend"));
    }
    const signed = await this.blobStorage.createSignedGetUrl(
      resolved.value.storageKey,
      this.signedUrlTtlSeconds,
      options
    );
    if (!signed.ok) return signed;
    return success({
      storageKey: resolved.value.storageKey,
      organizationId: resolved.value.organizationId,
      signedUrl: signed.value,
      expiresInSeconds: this.signedUrlTtlSeconds,
    });
  }
}
