/**
 * Secure artifact media delivery — short-lived signed URLs for tenant-owned blobs.
 * In-memory backends mint tokenized HTTP content URLs (never multi-MB data URLs in JSON)
 * so Expo Image / RN can load bytes without Authorization headers.
 *
 * Optional `format` query selects a supported download encoding. Raster images
 * may be converted PNG↔JPG; unsupported formats are rejected (never substituted).
 */

import type { IArtifactRepository } from "../../infrastructure/durability/interfaces/execution-store-ports";
import type { BlobAccessService } from "../blob/blob-access-service";
import type { IBlobStorage } from "../../persistence/interfaces/persistence";
import { failure, success, type Result } from "../../core/result";
import { NotFoundError, ValidationError } from "../../core/errors";
import { parseStorageRefKey } from "../blob/tenant-blob-key-builder";
import { EphemeralMediaTokenStore } from "./ephemeral-media-token-store";
import {
  canConvertRasterFormat,
  convertRasterImage,
  formatFromMime,
  mimeForRasterFormat,
  normalizeRasterFormat,
  type RasterDownloadFormat,
} from "./image-format-converter";
import {
  canExportRasterAsPdf,
  wrapRasterImageAsPdf,
} from "./raster-pdf-export";
import { randomBytes } from "crypto";
import {
  buildArtifactBundleZip,
  sanitizeBundleName,
  type BundleFormat,
  type BundleSourceFile,
} from "./artifact-bundle";

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
  /** When set, served as an attachment with this download filename. */
  readonly fileName?: string;
};

export type ArtifactBundleUrlResult = ArtifactMediaUrlResult & {
  readonly fileName: string;
  readonly entryNames: readonly string[];
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
    options?: { publicOrigin?: string; format?: string; preferSameOrigin?: boolean }
  ): Promise<Result<ArtifactMediaUrlResult>> {
    const rec = await this.artifacts.get(artifactId);
    if (!rec || rec.organizationId !== tenantOrganizationId) {
      return failure(new NotFoundError("Artifact not found"));
    }
    if (!rec.artifact.label.startsWith("blob:")) {
      return failure(new ValidationError("Artifact is not a durable blob reference"));
    }
    const storageRef = rec.artifact.label;
    const requestedRaw = options?.format?.trim();

    // Prefer ownership metadata for MIME (no byte download). Fall back to blob
    // Content-Type only when metadata is missing — vault save + format validation
    // both need a real type, not application/octet-stream.
    let sourceMime = "application/octet-stream";
    const owned = await this.blobAccess.resolveForTenantAsync(
      storageRef,
      tenantOrganizationId
    );
    if (owned.ok && owned.value.mimeType) {
      sourceMime = owned.value.mimeType;
    }
    const needsBlobMimeLookup =
      sourceMime === "application/octet-stream" || Boolean(requestedRaw);
    if (this.blobStorage && needsBlobMimeLookup) {
      const key = parseStorageRefKey(storageRef);
      const got = await this.blobStorage.get(key);
      if (got.ok && got.value?.contentType) {
        sourceMime = got.value.contentType;
      }
    }

    if (requestedRaw) {
      const validated = validateRequestedDownloadFormat({
        sourceMime,
        requested: requestedRaw,
      });
      if (!validated.ok) return validated;
    }

    const rasterTarget = normalizeRasterFormat(requestedRaw);
    const pdfRequested = requestedRaw?.trim().toLowerCase() === "pdf";
    const sourceRaster = formatFromMime(sourceMime);
    const needsPdfExport = pdfRequested && canExportRasterAsPdf(sourceMime);
    const needsRasterConversion =
      Boolean(rasterTarget) &&
      Boolean(sourceRaster) &&
      sourceRaster !== rasterTarget;

    // Prefer provider signed URL when no conversion is required (unless browser
    // clients need same-origin bytes for CORS-safe fetch, e.g. vault re-upload).
    if (
      !needsRasterConversion &&
      !needsPdfExport &&
      !options?.preferSameOrigin
    ) {
      const signed = await this.blobAccess.createProviderInputSignedUrl(
        storageRef,
        tenantOrganizationId
      );
      if (signed.ok) {
        return success({
          artifactId,
          signedUrl: signed.value.signedUrl,
          expiresInSeconds: signed.value.expiresInSeconds,
          // Always return contentType — clients re-upload to Brand Vault and
          // reject application/octet-stream (PRODUCT_ALLOWED_MIME).
          contentType: rasterTarget
            ? mimeForRasterFormat(rasterTarget)
            : sourceMime,
        });
      }
    }

    // Tokenized path (in-memory / conversion / non-S3).
    if (!this.blobStorage) {
      return failure(new ValidationError("Blob storage unavailable for media delivery"));
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
      ...(pdfRequested
        ? { requestedFormat: "pdf" as const }
        : rasterTarget
          ? { requestedFormat: rasterTarget }
          : {}),
    });
    const origin = normalizePublicOrigin(options?.publicOrigin);
    const formatQuery =
      pdfRequested || rasterTarget
        ? `&format=${encodeURIComponent(pdfRequested ? "pdf" : rasterTarget!)}`
        : "";
    const signedUrl = `${origin}/v1/artifacts/${encodeURIComponent(artifactId)}/content?token=${encodeURIComponent(token.token)}${formatQuery}`;
    return success({
      artifactId,
      signedUrl,
      expiresInSeconds: this.ephemeralTtlSeconds,
      contentType: pdfRequested
        ? "application/pdf"
        : rasterTarget
          ? mimeForRasterFormat(rasterTarget)
          : contentType,
    });
  }

  /**
   * ZIP several tenant-owned artifacts (raster → PNG/JPG/PDF) and return a
   * short-lived tokenized download URL for the archive.
   */
  async createArtifactBundleUrl(input: {
    readonly organizationId: string;
    readonly bundleName: string;
    readonly items: readonly { readonly artifactId: string; readonly name: string }[];
    readonly formats?: readonly BundleFormat[];
    readonly readme?: string;
    readonly publicOrigin?: string;
  }): Promise<Result<ArtifactBundleUrlResult>> {
    if (!this.blobStorage) {
      return failure(new ValidationError("Blob storage unavailable for media delivery"));
    }
    if (input.items.length === 0) {
      return failure(new ValidationError("Bundle requires at least one artifact"));
    }
    const files: BundleSourceFile[] = [];
    for (const item of input.items) {
      const rec = await this.artifacts.get(item.artifactId);
      if (!rec || rec.organizationId !== input.organizationId) {
        return failure(new NotFoundError(`Artifact not found: ${item.artifactId}`));
      }
      if (!rec.artifact.label.startsWith("blob:")) {
        return failure(
          new ValidationError(`Artifact is not a durable blob reference: ${item.artifactId}`)
        );
      }
      const got = await this.blobStorage.get(parseStorageRefKey(rec.artifact.label));
      if (!got.ok) return got;
      if (!got.value) {
        return failure(new NotFoundError(`Blob bytes not found: ${item.artifactId}`));
      }
      let mimeType = got.value.contentType ?? "";
      if (!mimeType || mimeType === "application/octet-stream") {
        const owned = await this.blobAccess.resolveForTenantAsync(
          rec.artifact.label,
          input.organizationId
        );
        if (owned.ok && owned.value.mimeType) mimeType = owned.value.mimeType;
      }
      files.push({
        name: item.name,
        bytes: Buffer.from(got.value.data, "base64"),
        mimeType: mimeType || "application/octet-stream",
      });
    }

    const built = await buildArtifactBundleZip({
      files,
      ...(input.formats ? { formats: input.formats } : {}),
      ...(input.readme ? { readme: input.readme } : {}),
    });
    if (!built.ok) return built;

    const bundleId = `bundle_${randomBytes(9).toString("hex")}`;
    const key = `tenant/${input.organizationId}/bundles/${bundleId}.zip`;
    const stored = await this.blobStorage.put(key, built.value.bytes, "application/zip");
    if (!stored.ok) return stored;

    const fileName = `${sanitizeBundleName(input.bundleName, "download")}.zip`;
    const token = this.tokens.mint({
      artifactId: bundleId,
      organizationId: input.organizationId,
      storageRef: `blob:${key}`,
      contentType: "application/zip",
      ttlSeconds: this.ephemeralTtlSeconds,
      fileName,
    });
    const origin = normalizePublicOrigin(input.publicOrigin);
    return success({
      artifactId: bundleId,
      signedUrl: `${origin}/v1/artifacts/${encodeURIComponent(bundleId)}/content?token=${encodeURIComponent(token.token)}`,
      expiresInSeconds: this.ephemeralTtlSeconds,
      contentType: "application/zip",
      fileName,
      entryNames: built.value.entryNames,
    });
  }

  async resolveArtifactBinaryByToken(
    artifactId: string,
    token: string,
    options?: { format?: string }
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

    const sourceMime = got.value.contentType ?? record.contentType;
    const bytes = Buffer.from(got.value.data, "base64");
    if (record.fileName) {
      return success({
        kind: "binary_media",
        artifactId,
        contentType: record.contentType,
        bytes,
        fileName: record.fileName,
      });
    }
    const requestedFormat = (options?.format ?? record.requestedFormat ?? "")
      .trim()
      .toLowerCase();

    if (requestedFormat === "pdf" && canExportRasterAsPdf(sourceMime)) {
      const exported = await wrapRasterImageAsPdf({
        bytes,
        sourceMime,
      });
      if (!exported.ok) return exported;
      return success({
        kind: "binary_media",
        artifactId,
        contentType: exported.value.contentType,
        bytes: exported.value.bytes,
      });
    }

    const target =
      normalizeRasterFormat(options?.format) ??
      normalizeRasterFormat(record.requestedFormat);

    if (!target) {
      return success({
        kind: "binary_media",
        artifactId,
        contentType: sourceMime,
        bytes,
      });
    }

    const validated = validateRequestedDownloadFormat({
      sourceMime,
      requested: target,
    });
    if (!validated.ok) return validated;

    const converted = convertRasterImage({
      bytes,
      sourceMime,
      targetFormat: target,
    });
    if (!converted.ok) return converted;

    return success({
      kind: "binary_media",
      artifactId,
      contentType: converted.value.contentType,
      bytes: converted.value.bytes,
    });
  }
}

export function validateRequestedDownloadFormat(input: {
  readonly sourceMime: string;
  readonly requested: string;
}): Result<RasterDownloadFormat | true> {
  const requested = input.requested.trim().toLowerCase();
  if (requested === "pdf" && canExportRasterAsPdf(input.sourceMime)) {
    return success(true);
  }
  const rasterTarget = normalizeRasterFormat(requested);
  const sourceRaster = formatFromMime(input.sourceMime);

  // Non-raster artifacts: only allow the exact stored extension family.
  if (!sourceRaster) {
    const sourceFormat = mimeToExactFormat(input.sourceMime);
    if (!sourceFormat) {
      return failure(
        new ValidationError(
          `Download format "${requested}" is not supported for this artifact`
        )
      );
    }
    const normalized =
      requested === "jpeg" ? "jpg" : requested;
    if (normalized !== sourceFormat) {
      return failure(
        new ValidationError(
          `Download format "${requested}" is not supported for this artifact (supported: ${sourceFormat})`
        )
      );
    }
    return success(true);
  }

  if (!rasterTarget) {
    return failure(
      new ValidationError(
        `Download format "${requested}" is not supported for this artifact (supported: png, jpg, pdf for raster images)`
      )
    );
  }

  if (
    !canConvertRasterFormat({
      sourceMime: input.sourceMime,
      requestedFormat: rasterTarget,
    })
  ) {
    return failure(
      new ValidationError(
        `Download format "${requested}" is not supported for this artifact`
      )
    );
  }

  return success(rasterTarget);
}

function mimeToExactFormat(mimeType: string): string | undefined {
  const mime = mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (mime === "application/pdf") return "pdf";
  if (mime.includes("presentationml")) return "pptx";
  if (mime.includes("wordprocessingml")) return "docx";
  if (mime === "text/html" || mime === "application/xhtml+xml") return "html";
  if (mime === "application/zip" || mime === "application/x-zip-compressed") {
    return "zip";
  }
  if (mime === "video/mp4") return "mp4";
  if (mime === "text/plain") return "txt";
  if (mime === "image/svg+xml") return "svg";
  return undefined;
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
