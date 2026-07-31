/**
 * Tenant-authoritative blob access — never trust client-supplied organizationId.
 */

import { failure, success, type Result } from "../../intelligence/shared/result";
import { ValidationError } from "../../intelligence/shared/errors";
import { BlobOwnershipRegistry } from "./blob-ownership-registry";
import type { IBlobMetadataRepository } from "./blob-metadata-repository";
import type { S3BlobStorage, RecordingS3BlobStorage } from "../../persistence/storage/s3-blob-storage";
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

  async createProviderInputSignedUrl(
    storageRef: string,
    tenantOrganizationId: string
  ): Promise<Result<SignedBlobAccess>> {
    const resolved = await this.resolveForTenantAsync(storageRef, tenantOrganizationId);
    if (!resolved.ok) return resolved;
    if (!this.blobStorage?.createSignedGetUrl) {
      return failure(new ValidationError("Signed URL not available for blob storage backend"));
    }
    const signed = await this.blobStorage.createSignedGetUrl(
      resolved.value.storageKey,
      this.signedUrlTtlSeconds
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
