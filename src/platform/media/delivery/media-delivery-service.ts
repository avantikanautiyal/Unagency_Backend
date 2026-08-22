/**
 * Secure artifact media delivery — short-lived signed URLs for tenant-owned blobs.
 * In-memory backends mint tokenized HTTP content URLs (never multi-MB data URLs in JSON)
 * so Expo Image / RN can load bytes without Authorization headers.
 */

import type { IArtifactRepository } from "../../infrastructure/durability/interfaces/execution-store-ports";
import type { BlobAccessService } from "../blob/blob-access-service";
import type { IBlobStorage } from "../../persistence/interfaces/persistence";
import { failure, success, type Result } from "../../intelligence/shared/result";
import { NotFoundError, ValidationError } from "../../intelligence/shared/errors";
import { parseStorageRefKey } from "../blob/tenant-blob-key-builder";
import { EphemeralMediaTokenStore } from "./ephemeral-media-token-store";

export type ArtifactMediaUrlResult = {
  readonly artifactId: string;
  readonly signedUrl: string;
  readonly expiresInSeconds: number;
  readonly contentType?: string;
};

export type ArtifactBinaryContent = {
  readonly kind: "binary_media";
  readonly artifactId: string;
  readonly contentType: string;
  readonly bytes: Buffer;
};

export function isArtifactBinaryContent(value: unknown): value is ArtifactBinaryContent {
  return (
    !!value &&
    typeof value === "object" &&
    (value as ArtifactBinaryContent).kind === "binary_media" &&
    Buffer.isBuffer((value as ArtifactBinaryContent).bytes)
  );
}

export class MediaDeliveryService {
  private readonly tokens = new EphemeralMediaTokenStore();

  constructor(
    private readonly artifacts: IArtifactRepository,
    private readonly blobAccess: BlobAccessService,
    private readonly blobStorage?: IBlobStorage,
    private readonly ephemeralTtlSeconds = 300
  ) {}

  async resolveArtifactMediaUrl(
    artifactId: string,
    tenantOrganizationId: string,
    options?: { publicOrigin?: string }
  ): Promise<Result<ArtifactMediaUrlResult>> {
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

    // In-memory / non-S3 backends — tokenized HTTP URL (Expo-safe), not a data URL.
    if (!this.blobStorage) {
      return signed;
    }
    const key = parseStorageRefKey(storageRef);
    const got = await this.blobStorage.get(key);
    if (!got.ok) return got;
    if (!got.value) {
      return failure(new NotFoundError("Blob bytes not found"));
    }
    const contentType = got.value.contentType ?? "application/octet-stream";
    const token = this.tokens.mint({
      artifactId,
      organizationId: tenantOrganizationId,
      storageRef,
      contentType,
      ttlSeconds: this.ephemeralTtlSeconds,
    });
    const origin = normalizePublicOrigin(options?.publicOrigin);
    const signedUrl = `${origin}/v1/artifacts/${encodeURIComponent(artifactId)}/content?token=${encodeURIComponent(token.token)}`;
    return success({
      artifactId,
      signedUrl,
      expiresInSeconds: this.ephemeralTtlSeconds,
      contentType,
    });
  }

  async resolveArtifactBinaryByToken(
    artifactId: string,
    token: string
  ): Promise<Result<ArtifactBinaryContent>> {
    const record = this.tokens.resolve(token);
    if (!record || record.artifactId !== artifactId) {
      return failure(new NotFoundError("Media token invalid or expired"));
    }
    if (!this.blobStorage) {
      return failure(new ValidationError("Blob storage unavailable"));
    }
    const key = parseStorageRefKey(record.storageRef);
    const got = await this.blobStorage.get(key);
    if (!got.ok) return got;
    if (!got.value) {
      return failure(new NotFoundError("Blob bytes not found"));
    }
    return success({
      kind: "binary_media",
      artifactId,
      contentType: got.value.contentType ?? record.contentType,
      bytes: Buffer.from(got.value.data, "base64"),
    });
  }
}

function normalizePublicOrigin(raw?: string): string {
  const fromEnv = process.env.ENTERPRISE_PUBLIC_API_ORIGIN?.trim();
  const candidate = (raw?.trim() || fromEnv || "http://127.0.0.1:4000").replace(/\/$/, "");
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "http://127.0.0.1:4000";
    }
    return `${url.protocol}//${url.host}`;
  } catch {
    return "http://127.0.0.1:4000";
  }
}
