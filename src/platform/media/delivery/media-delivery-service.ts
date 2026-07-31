/**
 * Secure artifact media delivery — short-lived signed URLs for tenant-owned blobs.
 * Credential-free / in-memory: ephemeral data URLs (never durable identity).
 */

import type { IArtifactRepository } from "../../infrastructure/durability/interfaces/execution-store-ports";
import type { BlobAccessService } from "../blob/blob-access-service";
import type { IBlobStorage } from "../../persistence/interfaces/persistence";
import { failure, success, type Result } from "../../intelligence/shared/result";
import { NotFoundError, ValidationError } from "../../intelligence/shared/errors";
import { parseStorageRefKey } from "../blob/tenant-blob-key-builder";

export class MediaDeliveryService {
  constructor(
    private readonly artifacts: IArtifactRepository,
    private readonly blobAccess: BlobAccessService,
    private readonly blobStorage?: IBlobStorage,
    private readonly ephemeralTtlSeconds = 300
  ) {}

  async resolveArtifactMediaUrl(
    artifactId: string,
    tenantOrganizationId: string
  ): Promise<Result<{ artifactId: string; signedUrl: string; expiresInSeconds: number }>> {
    const rec = await this.artifacts.get(artifactId);
    if (!rec || rec.organizationId !== tenantOrganizationId) {
      return failure(new NotFoundError("Artifact not found"));
    }
    if (!rec.artifact.label.startsWith("blob:")) {
      return failure(new ValidationError("Artifact is not a durable blob reference"));
    }
    const storageRef = rec.artifact.label;
    const signed = await this.blobAccess.createProviderInputSignedUrl(
      storageRef,
      tenantOrganizationId
    );
    if (signed.ok) {
      return success({
        artifactId,
        signedUrl: signed.value.signedUrl,
        expiresInSeconds: signed.value.expiresInSeconds,
      });
    }

    // In-memory / non-S3 backends — ephemeral data URL for product presentation (M10.6).
    if (this.blobStorage) {
      const key = parseStorageRefKey(storageRef);
      const got = await this.blobStorage.get(key);
      if (!got.ok) return got;
      if (!got.value) {
        return failure(new NotFoundError("Blob bytes not found"));
      }
      const mime = got.value.contentType ?? "application/octet-stream";
      const dataUrl = `data:${mime};base64,${got.value.data}`;
      return success({
        artifactId,
        signedUrl: dataUrl,
        expiresInSeconds: this.ephemeralTtlSeconds,
      });
    }

    return signed;
  }
}
