/**
 * Product asset domain service (M10.4 + M10.18).
 * Metadata: MediaFile. Bytes: IBlobStorage (server-controlled keys).
 * Single upload authority for vault, brand, knowledge, voice, briefs, profiles.
 */

import mongoose from "mongoose";
import MediaFile, {
  type BrandAssetApprovalStatus,
  type IMediaFile,
  type ProductAssetKind,
  type ProductAssetLifecycle,
} from "../models/mediaFile.model";
import { MultipartUploadSession } from "../models/multipart-upload-session.model";
import Organizations from "../models/organization.model";
import Teams from "../models/team.model";
import Projects from "../models/projects.model";
import Requirement from "../models/requestProject.model";
import { ApiError } from "../utils/apiError";
import {
  getProductAssetBlobStorage,
  type ProductAssetBlobStorage,
} from "./product-asset-storage";
import {
  DEFAULT_MEDIA_SIZE_LIMITS,
  inferMediaCategory,
  type MediaCategory,
} from "../platform/media/ingestion/media-size-limits";
import {
  PRODUCT_ALLOWED_MIME,
  cacheControlForAsset,
  runUploadPipeline,
} from "../platform/media/upload/upload-pipeline";
import {
  enqueueMediaJob,
  enqueuePostUploadJobs,
} from "../platform/media/processing/media-processing-job-store";
import { auditMediaAccess } from "../platform/media/audit/media-access-audit";
import { supportsMultipart } from "../platform/persistence/storage/multipart-blob-storage";
import { registerProductAssetBlobOwnership } from "./register-product-asset-blob-ownership";

const SIGNED_TTL_SECONDS = Math.min(
  Number(process.env.ENTERPRISE_BLOB_SIGNED_URL_TTL_SECONDS ?? 300) || 300,
  3600
);

const RETENTION_MS =
  Number(process.env.PRODUCT_ASSET_RETENTION_MS ?? 7 * 24 * 60 * 60 * 1000) ||
  7 * 24 * 60 * 60 * 1000;

const DEDUPE_ENABLED = process.env.PRODUCT_ASSET_DEDUPE !== "false";

/** Canonical brand asset folders (M10.18 PART 8) */
export const BRAND_ASSET_FOLDERS = [
  "logos",
  "logo-versions",
  "cover",
  "social",
  "marketing",
  "guidelines",
] as const;

export type ProductAssetDto = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  kind: ProductAssetKind;
  createdAt: string;
  updatedAt?: string;
  organizationId: string;
  projectId?: string;
  briefId?: string;
  brandId?: string;
  folder?: string;
  tags?: string[];
  status: string;
  lifecycle?: ProductAssetLifecycle;
  checksum?: string;
  version?: number;
  approvalStatus?: BrandAssetApprovalStatus;
  preview?: { available: boolean; width?: number; height?: number };
  etag?: string;
};

function kindFromMime(mime: string): ProductAssetKind {
  const cat = inferMediaCategory(mime);
  if (cat === "image") return "image";
  if (cat === "video") return "video";
  if (cat === "audio") return "audio";
  const base = mime.toLowerCase().split(";")[0]?.trim() || "";
  if (
    base === "application/pdf" ||
    base.startsWith("text/") ||
    base.includes("document") ||
    base.includes("presentation") ||
    base === "application/zip" ||
    base === "application/x-zip-compressed"
  ) {
    return "document";
  }
  return "other";
}

export function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "file";
  const cleaned = base
    .replace(/\0/g, "")
    .replace(/\.\./g, "")
    .replace(/[^\w.\- ()[\]]+/g, "_")
    .trim();
  if (!cleaned || cleaned === "." || cleaned === "..") return "file";
  return cleaned.slice(0, 180);
}

export function buildProductAssetStorageKey(input: {
  organizationId: string;
  assetId: string;
  filename: string;
}): string {
  const safe = sanitizeFilename(input.filename);
  return `tenant/${input.organizationId}/assets/${input.assetId}/${safe}`;
}

export function toProductAssetDto(doc: IMediaFile): ProductAssetDto {
  return {
    id: doc._id.toString(),
    name: doc.fileName || "untitled",
    mimeType: doc.mimeType || "application/octet-stream",
    sizeBytes: doc.sizeBytes ?? 0,
    kind: doc.kind || "other",
    createdAt: (doc.uploadedAt || (doc as any).createdAt || new Date()).toISOString?.()
      ? new Date(doc.uploadedAt || (doc as any).createdAt).toISOString()
      : new Date().toISOString(),
    updatedAt: (doc as any).updatedAt
      ? new Date((doc as any).updatedAt).toISOString()
      : undefined,
    organizationId: doc.organizationId?.toString() ?? "",
    projectId: doc.projectId?.toString(),
    briefId: doc.briefId?.toString(),
    brandId: doc.brandId?.toString(),
    folder: doc.folder || undefined,
    tags: Array.isArray(doc.tags) ? doc.tags.map(String) : [],
    status: doc.status ?? "active",
    lifecycle: doc.lifecycle ?? "published",
    checksum: doc.checksum || undefined,
    version: doc.version ?? 1,
    approvalStatus: doc.approvalStatus ?? "none",
    preview: {
      available: Boolean(doc.preview?.available ?? (doc.kind || "other") === "image"),
      width: doc.preview?.width,
      height: doc.preview?.height,
    },
    etag: doc.etag || doc.checksum || undefined,
  };
}

export async function assertUserBelongsToOrganization(
  userId: string,
  organizationId: string
): Promise<void> {
  const orgObjectId = new mongoose.Types.ObjectId(organizationId);
  const owned = await Organizations.exists({
    _id: orgObjectId,
    owner: new mongoose.Types.ObjectId(userId),
  });
  if (owned) return;
  const membership = await Teams.exists({
    Organization: orgObjectId,
    userId: new mongoose.Types.ObjectId(userId),
    invitationStatus: "accepted",
  });
  if (!membership) {
    throw new ApiError("Organisation membership required", 403);
  }
}

export async function resolveCustomerOrganizationId(
  userId: string,
  requestedOrgId?: string
): Promise<string> {
  if (requestedOrgId) {
    await assertUserBelongsToOrganization(userId, requestedOrgId);
    return requestedOrgId;
  }
  const owned = await Organizations.findOne({
    owner: new mongoose.Types.ObjectId(userId),
  });
  if (owned) return owned._id.toString();
  const team = await Teams.findOne({
    userId: new mongoose.Types.ObjectId(userId),
    invitationStatus: "accepted",
  });
  if (team?.Organization) return team.Organization.toString();
  throw new ApiError("No organisation found for principal", 400);
}

export class ProductAssetService {
  constructor(private readonly storage: ProductAssetBlobStorage = getProductAssetBlobStorage()) {}

  async upload(input: {
    userId: string;
    organizationId?: string;
    filename: string;
    mimeType: string;
    bytes: Buffer;
    projectId?: string;
    briefId?: string;
    brandId?: string;
    folder?: string;
    tags?: string[];
    tag?: string;
    lifecycle?: ProductAssetLifecycle;
    approvalStatus?: BrandAssetApprovalStatus;
    parentAssetId?: string;
    dedupe?: boolean;
    executionId?: string;
    promptHash?: string;
    modelId?: string;
    providerId?: string;
  }): Promise<ProductAssetDto> {
    if (this.storage.mode === "unavailable") {
      throw new ApiError(
        "Product asset storage is not configured. Set ENTERPRISE_BLOB_BUCKET or AWS_S3_BUCKET (or PRODUCT_ASSET_STORAGE=memory for tests).",
        503
      );
    }

    const organizationId = await resolveCustomerOrganizationId(
      input.userId,
      input.organizationId
    );

    const pipeline = await runUploadPipeline({
      filename: input.filename,
      mimeType: input.mimeType,
      bytes: input.bytes,
      organizationId,
      allowedMime: PRODUCT_ALLOWED_MIME,
      sizeLimits: DEFAULT_MEDIA_SIZE_LIMITS,
    });
    if (!pipeline.ok) {
      throw new ApiError(pipeline.message, pipeline.statusCode);
    }

    const kind = kindFromMime(pipeline.mimeType);

    let resolvedBrandId = input.brandId?.trim() || undefined;
    if (input.executionId?.trim()) {
      try {
        const { EnterpriseExecution } = await import(
          "../platform/infrastructure/durability/mongo/models/enterprise-execution.model"
        );
        const exec = await EnterpriseExecution.findOne({
          executionId: input.executionId.trim(),
          organizationId,
        })
          .select("brandId")
          .lean();
        const ownership = exec?.brandId?.trim();
        if (ownership) {
          resolvedBrandId = ownership;
        }
      } catch {
        // Ownership lookup must not fail upload — fall through to client brandId.
      }
    }

    if (input.projectId) {
      await this.assertProjectInOrg(input.projectId, organizationId, input.userId);
    }
    if (input.briefId) {
      await this.assertBriefOwnedByUser(input.briefId, input.userId, organizationId);
    }
    if (resolvedBrandId) {
      const Brands = (await import("../models/brand.model")).default;
      const brand = await Brands.findOne({
        _id: resolvedBrandId,
        organizationId: new mongoose.Types.ObjectId(organizationId),
        status: "active",
      });
      if (!brand) throw new ApiError("Brand not found in organisation", 404);
    }

    const wantDedupe = input.dedupe !== false && DEDUPE_ENABLED;
    if (wantDedupe && pipeline.checksum) {
      const dedupeFilter: Record<string, unknown> = {
        organizationId: new mongoose.Types.ObjectId(organizationId),
        checksum: pipeline.checksum,
        status: { $ne: "deleted" },
        storageKey: { $exists: true, $ne: null },
      };
      if (resolvedBrandId) {
        dedupeFilter.brandId = new mongoose.Types.ObjectId(resolvedBrandId);
      }
      const existing = await MediaFile.findOne(dedupeFilter);
      if (existing) {
        void auditMediaAccess({
          action: "upload",
          organizationId,
          userId: input.userId,
          assetId: existing._id.toString(),
          detail: "duplicate_checksum_reuse",
        });
        return toProductAssetDto(existing);
      }
    }

    let version = 1;
    let parentAssetId: mongoose.Types.ObjectId | undefined;
    if (input.parentAssetId) {
      const parent = await this.requireOwnedAsset(input.userId, input.parentAssetId);
      parentAssetId = parent._id as mongoose.Types.ObjectId;
      version = (parent.version ?? 1) + 1;
    }

    const assetId = new mongoose.Types.ObjectId();
    const safeName = sanitizeFilename(input.filename);
    const storageKey = buildProductAssetStorageKey({
      organizationId,
      assetId: assetId.toString(),
      filename: safeName,
    });

    const put = await this.storage.put(storageKey, input.bytes, pipeline.mimeType);
    if (!put.ok) {
      throw new ApiError(put.error.message || "Blob put failed", 500);
    }
    const checksum = put.value.checksum ?? pipeline.checksum;

    try {
      const lifecycle = input.lifecycle ?? "published";
      const doc = await MediaFile.create({
        _id: assetId,
        url: `blob:${storageKey}`,
        storageKey,
        fileName: safeName,
        tag: input.tag ?? "product_asset",
        organizationId: new mongoose.Types.ObjectId(organizationId),
        uploaderUserId: new mongoose.Types.ObjectId(input.userId),
        projectId: input.projectId
          ? new mongoose.Types.ObjectId(input.projectId)
          : undefined,
        briefId: input.briefId
          ? new mongoose.Types.ObjectId(input.briefId)
          : undefined,
        brandId: resolvedBrandId
          ? new mongoose.Types.ObjectId(resolvedBrandId)
          : undefined,
        folder: input.folder ?? "",
        tags: input.tags ?? [],
        mimeType: pipeline.mimeType,
        sizeBytes: pipeline.sizeBytes,
        kind,
        status: "active",
        lifecycle,
        checksum,
        etag: checksum,
        scanStatus:
          pipeline.scan.verdict === "clean"
            ? "clean"
            : pipeline.scan.verdict === "skipped"
              ? "skipped"
              : "error",
        approvalStatus: input.approvalStatus ?? "none",
        parentAssetId,
        version,
        preview: { available: kind === "image" },
        executionId: input.executionId,
        promptHash: input.promptHash,
        modelId: input.modelId,
        providerId: input.providerId,
        uploadedAt: new Date(),
      });
      const dto = toProductAssetDto(doc);

      void enqueuePostUploadJobs({
        organizationId,
        assetId: dto.id,
        storageKey,
        mimeType: pipeline.mimeType,
        brandId: resolvedBrandId,
        assetName: dto.name,
      }).catch((err) => {
        console.warn(
          "[product-asset-service] enqueue post-upload jobs failed:",
          err instanceof Error ? err.message : err
        );
      });

      void auditMediaAccess({
        action: "upload",
        organizationId,
        userId: input.userId,
        assetId: dto.id,
        storageKey,
      });

      void registerProductAssetBlobOwnership({
        storageKey,
        organizationId,
        assetId: dto.id,
        mimeType: pipeline.mimeType,
        sizeBytes: pipeline.sizeBytes,
        checksum,
        executionId: input.executionId,
      }).catch((err) => {
        console.warn(
          "[product-asset-service] blob ownership registration failed:",
          err instanceof Error ? err.message : err
        );
      });

      return dto;
    } catch (err) {
      await this.storage.delete(storageKey).catch(() => undefined);
      throw err;
    }
  }

  async list(input: {
    userId: string;
    organizationId?: string;
    brandId?: string;
    folder?: string;
    q?: string;
    sort?: "newest" | "oldest" | "name";
    lifecycle?: ProductAssetLifecycle;
  }): Promise<ProductAssetDto[]> {
    const organizationId = await resolveCustomerOrganizationId(
      input.userId,
      input.organizationId
    );
    const filter: Record<string, unknown> = {
      organizationId: new mongoose.Types.ObjectId(organizationId),
      status: { $ne: "deleted" },
      storageKey: { $exists: true, $ne: null },
    };
    if (input.brandId) {
      filter.brandId = new mongoose.Types.ObjectId(input.brandId);
    }
    if (input.folder != null && input.folder !== "") {
      filter.folder = input.folder;
    }
    if (input.lifecycle) {
      filter.lifecycle = input.lifecycle;
    }
    if (input.q?.trim()) {
      filter.fileName = { $regex: input.q.trim(), $options: "i" };
    }
    const docs = await MediaFile.find(filter);
    const sorted = [...docs].sort((a: any, b: any) => {
      if (input.sort === "name") {
        return String(a.fileName || "").localeCompare(String(b.fileName || ""));
      }
      const at = new Date(a.createdAt || a.uploadedAt || 0).getTime();
      const bt = new Date(b.createdAt || b.uploadedAt || 0).getTime();
      return input.sort === "oldest" ? at - bt : bt - at;
    });
    return sorted.map(toProductAssetDto);
  }

  async updateMeta(input: {
    userId: string;
    assetId: string;
    patch: Partial<{
      name: string;
      folder: string;
      tags: string[];
      brandId: string | null;
      lifecycle: ProductAssetLifecycle;
      approvalStatus: BrandAssetApprovalStatus;
    }>;
  }): Promise<ProductAssetDto> {
    const doc = await this.requireOwnedAsset(input.userId, input.assetId);
    if (input.patch.name != null) {
      // Display title for vault tiles — keep human labels (·, &); block path tricks only.
      const raw = String(input.patch.name).trim().replace(/\0/g, "").replace(/\.\./g, "");
      doc.fileName = (raw || "untitled").slice(0, 180);
    }
    if (input.patch.folder != null) doc.folder = String(input.patch.folder);
    if (input.patch.tags != null) doc.tags = input.patch.tags.map(String);
    if (input.patch.brandId === null) {
      doc.brandId = undefined;
    } else if (input.patch.brandId) {
      doc.brandId = new mongoose.Types.ObjectId(input.patch.brandId);
    }
    if (input.patch.lifecycle) {
      if (input.patch.lifecycle === "deleted") {
        throw new ApiError("Use delete endpoint for soft-delete", 400);
      }
      doc.lifecycle = input.patch.lifecycle;
    }
    if (input.patch.approvalStatus) {
      doc.approvalStatus = input.patch.approvalStatus;
    }
    await doc.save();
    return toProductAssetDto(doc);
  }

  async get(input: {
    userId: string;
    assetId: string;
  }): Promise<ProductAssetDto> {
    const doc = await this.requireOwnedAsset(input.userId, input.assetId);
    return toProductAssetDto(doc);
  }

  async getMedia(input: {
    userId: string;
    assetId: string;
    disposition?: "inline" | "attachment" | "stream";
    refresh?: boolean;
  }): Promise<{
    mediaUrl: string;
    expiresInSeconds: number;
    contentType: string;
    etag?: string;
    cacheControl: string;
    disposition: string;
  }> {
    let doc: IMediaFile;
    try {
      doc = await this.requireOwnedAsset(input.userId, input.assetId);
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 403) {
        void auditMediaAccess({
          action: "cross_tenant_rejected",
          userId: input.userId,
          assetId: input.assetId,
          success: false,
        });
      }
      throw err;
    }
    if (!doc.storageKey) {
      if (doc.url && !doc.url.startsWith("blob:")) {
        return {
          mediaUrl: doc.url,
          expiresInSeconds: 0,
          contentType: doc.mimeType || "application/octet-stream",
          cacheControl: "private, no-store",
          disposition: "inline",
        };
      }
      throw new ApiError("Asset has no durable storage key", 404);
    }
    if (!this.storage.createSignedGetUrl) {
      throw new ApiError("Signed media delivery unavailable", 503);
    }

    const dispositionRaw = input.disposition ?? "inline";
    const disposition =
      dispositionRaw === "attachment" ? "attachment" : "inline";
    const cacheControl = cacheControlForAsset("product");

    const signed = await this.storage.createSignedGetUrl(
      doc.storageKey,
      SIGNED_TTL_SECONDS,
      {
        disposition,
        filename: doc.fileName || "file",
        cacheControl,
      }
    );
    if (!signed.ok) {
      throw new ApiError(signed.error.message || "Could not sign media URL", 500);
    }

    const action =
      dispositionRaw === "stream"
        ? "stream"
        : dispositionRaw === "attachment"
          ? "download"
          : input.refresh
            ? "signed_url_refresh"
            : "preview";

    void auditMediaAccess({
      action,
      organizationId: doc.organizationId?.toString(),
      userId: input.userId,
      assetId: doc._id.toString(),
      storageKey: doc.storageKey,
      disposition: dispositionRaw,
    });

    return {
      mediaUrl: signed.value,
      expiresInSeconds: SIGNED_TTL_SECONDS,
      contentType: doc.mimeType || "application/octet-stream",
      etag: doc.etag || doc.checksum,
      cacheControl,
      disposition: dispositionRaw,
    };
  }

  /**
   * Resolve a product asset into a provider input reference.
   */
  async resolveProviderInputAsset(input: {
    userId: string;
    assetId: string;
    organizationId: string;
  }): Promise<{
    storageRef?: string;
    url?: string;
    organizationId: string;
    mimeType: string;
    filename?: string;
  }> {
    const doc = await this.requireOwnedAsset(input.userId, input.assetId);
    const orgId = doc.organizationId?.toString() || "";
    if (orgId && orgId !== input.organizationId) {
      throw new ApiError("Asset does not belong to organization", 403);
    }
    const mimeType = doc.mimeType || "application/octet-stream";
    const filename = doc.fileName || "audio";
    if (!doc.storageKey) {
      if (doc.url && typeof doc.url === "string") {
        return {
          url: doc.url,
          organizationId: input.organizationId,
          mimeType,
          filename,
        };
      }
      throw new ApiError("Asset has no durable storage key", 404);
    }
    const got = await this.storage.get(doc.storageKey);
    if (!got.ok || !got.value) {
      throw new ApiError("Asset bytes unavailable", 404);
    }
    const data = got.value.data;
    const contentType = got.value.contentType || mimeType;
    const url = data.startsWith("data:")
      ? data
      : `data:${contentType};base64,${data}`;

    await registerProductAssetBlobOwnership({
      storageKey: doc.storageKey,
      organizationId: input.organizationId,
      assetId: doc._id.toString(),
      mimeType: contentType,
      sizeBytes: doc.sizeBytes ?? undefined,
      checksum: doc.checksum ?? undefined,
      executionId: doc.executionId?.toString(),
    });

    return {
      storageRef: doc.storageKey,
      url,
      organizationId: input.organizationId,
      mimeType: contentType,
      filename,
    };
  }

  async delete(input: {
    userId: string;
    assetId: string;
  }): Promise<{ id: string; status: string }> {
    const doc = await this.requireOwnedAsset(input.userId, input.assetId);
    doc.status = "deleted";
    doc.lifecycle = "deleted";
    doc.deletedAt = new Date();
    await doc.save();

    // Soft-delete only — blob retained until retention cleanup job
    if (doc.storageKey) {
      void enqueueMediaJob({
        kind: "media.cleanup",
        organizationId: doc.organizationId!.toString(),
        assetId: doc._id.toString(),
        storageKey: doc.storageKey,
        runAfterMs: RETENTION_MS,
      }).catch(() => undefined);
    }

    void auditMediaAccess({
      action: "delete",
      organizationId: doc.organizationId?.toString(),
      userId: input.userId,
      assetId: doc._id.toString(),
      storageKey: doc.storageKey,
    });

    return { id: doc._id.toString(), status: "deleted" };
  }

  /**
   * Hard-delete vault assets matching project / execution / explicit ids.
   * Used when a project or service chat is permanently removed.
   */
  async hardDeleteMatching(input: {
    userId: string;
    organizationId?: string;
    projectId?: string;
    executionIds?: string[];
    assetIds?: string[];
  }): Promise<{ deletedCount: number }> {
    const organizationId = await resolveCustomerOrganizationId(
      input.userId,
      input.organizationId
    );
    const or: Record<string, unknown>[] = [];
    if (input.projectId && mongoose.isValidObjectId(input.projectId)) {
      or.push({ projectId: new mongoose.Types.ObjectId(input.projectId) });
    }
    const executionIds = [
      ...new Set(
        (input.executionIds ?? [])
          .map((id) => String(id || "").trim())
          .filter(Boolean)
      ),
    ];
    if (executionIds.length > 0) {
      or.push({ executionId: { $in: executionIds } });
    }
    const assetIds = [
      ...new Set(
        (input.assetIds ?? [])
          .map((id) => String(id || "").trim())
          .filter((id) => mongoose.isValidObjectId(id))
      ),
    ];
    if (assetIds.length > 0) {
      or.push({
        _id: {
          $in: assetIds.map((id) => new mongoose.Types.ObjectId(id)),
        },
      });
    }
    if (or.length === 0) {
      return { deletedCount: 0 };
    }

    const docs = await MediaFile.find({
      organizationId: new mongoose.Types.ObjectId(organizationId),
      $or: or,
    })
      .select("_id storageKey thumbnailKey organizationId")
      .lean();

    if (docs.length === 0) {
      return { deletedCount: 0 };
    }

    for (const doc of docs) {
      const storageKey =
        typeof doc.storageKey === "string" ? doc.storageKey : undefined;
      const thumbnailKey =
        typeof (doc as { thumbnailKey?: string }).thumbnailKey === "string"
          ? (doc as { thumbnailKey?: string }).thumbnailKey
          : undefined;
      if (storageKey) {
        await this.storage.delete(storageKey).catch(() => undefined);
      }
      if (thumbnailKey) {
        await this.storage.delete(thumbnailKey).catch(() => undefined);
      }
      void auditMediaAccess({
        action: "delete",
        organizationId,
        userId: input.userId,
        assetId: String(doc._id),
        storageKey,
        detail: "hard_delete_cascade",
      });
    }

    const result = await MediaFile.deleteMany({
      organizationId: new mongoose.Types.ObjectId(organizationId),
      _id: { $in: docs.map((d) => d._id) },
    });
    return { deletedCount: result.deletedCount ?? docs.length };
  }

  async restore(input: {
    userId: string;
    assetId: string;
  }): Promise<ProductAssetDto> {
    if (!mongoose.isValidObjectId(input.assetId)) {
      throw new ApiError("Invalid asset id", 400);
    }
    const doc = await MediaFile.findById(input.assetId);
    if (!doc || !doc.organizationId) {
      throw new ApiError("Asset not found", 404);
    }
    await assertUserBelongsToOrganization(
      input.userId,
      doc.organizationId.toString()
    );
    if (doc.status !== "deleted") {
      return toProductAssetDto(doc);
    }
    if (!doc.storageKey) {
      throw new ApiError("Cannot restore asset without storage key", 409);
    }
    const exists = await this.storage.get(doc.storageKey);
    if (!exists.ok || !exists.value) {
      throw new ApiError("Blob already purged — cannot restore", 410);
    }
    doc.status = "active";
    doc.lifecycle = "published";
    doc.deletedAt = undefined;
    await doc.save();

    void auditMediaAccess({
      action: "restore",
      organizationId: doc.organizationId.toString(),
      userId: input.userId,
      assetId: doc._id.toString(),
      storageKey: doc.storageKey,
    });

    return toProductAssetDto(doc);
  }

  /** Multipart initiate — large file resume support */
  async initiateMultipart(input: {
    userId: string;
    organizationId?: string;
    filename: string;
    mimeType: string;
    projectId?: string;
    briefId?: string;
    brandId?: string;
    folder?: string;
  }): Promise<{
    uploadId: string;
    assetId: string;
    storageKey: string;
    partSizeHint: number;
    expiresAt: string;
  }> {
    if (this.storage.mode === "unavailable") {
      throw new ApiError("Product asset storage is not configured", 503);
    }
    if (!supportsMultipart(this.storage)) {
      throw new ApiError("Multipart uploads not supported by storage provider", 501);
    }
    const organizationId = await resolveCustomerOrganizationId(
      input.userId,
      input.organizationId
    );
    const mime = (input.mimeType || "").toLowerCase().trim().split(";")[0]?.trim() || "";
    if (!PRODUCT_ALLOWED_MIME.has(mime)) {
      throw new ApiError("MIME type not allowed", 400);
    }

    const assetId = new mongoose.Types.ObjectId();
    const safeName = sanitizeFilename(input.filename);
    const storageKey = buildProductAssetStorageKey({
      organizationId,
      assetId: assetId.toString(),
      filename: safeName,
    });

    const init = await this.storage.createMultipartUpload(storageKey, mime);
    if (!init.ok) {
      throw new ApiError(init.error.message || "Multipart init failed", 500);
    }

    const kind = kindFromMime(mime);
    await MediaFile.create({
      _id: assetId,
      url: `blob:${storageKey}`,
      storageKey,
      fileName: safeName,
      tag: "product_asset_multipart",
      organizationId: new mongoose.Types.ObjectId(organizationId),
      uploaderUserId: new mongoose.Types.ObjectId(input.userId),
      projectId: input.projectId
        ? new mongoose.Types.ObjectId(input.projectId)
        : undefined,
      briefId: input.briefId
        ? new mongoose.Types.ObjectId(input.briefId)
        : undefined,
      brandId: input.brandId
        ? new mongoose.Types.ObjectId(input.brandId)
        : undefined,
      folder: input.folder ?? "",
      mimeType: mime,
      sizeBytes: 0,
      kind,
      status: "active",
      lifecycle: "temporary",
      scanStatus: "pending",
      uploadedAt: new Date(),
    });

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await MultipartUploadSession.create({
      uploadId: init.value.uploadId,
      storageKey,
      assetId,
      organizationId: new mongoose.Types.ObjectId(organizationId),
      userId: new mongoose.Types.ObjectId(input.userId),
      mimeType: mime,
      filename: safeName,
      status: "initiated",
      parts: [],
      brandId: input.brandId
        ? new mongoose.Types.ObjectId(input.brandId)
        : undefined,
      folder: input.folder,
      projectId: input.projectId
        ? new mongoose.Types.ObjectId(input.projectId)
        : undefined,
      briefId: input.briefId
        ? new mongoose.Types.ObjectId(input.briefId)
        : undefined,
      expiresAt,
    });

    return {
      uploadId: init.value.uploadId,
      assetId: assetId.toString(),
      storageKey,
      partSizeHint: 8 * 1024 * 1024,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async uploadMultipartPart(input: {
    userId: string;
    uploadId: string;
    partNumber: number;
    bytes: Buffer;
  }): Promise<{ partNumber: number; etag: string }> {
    if (!supportsMultipart(this.storage)) {
      throw new ApiError("Multipart uploads not supported", 501);
    }
    const session = await this.requireMultipartSession(input.userId, input.uploadId);
    if (session.status === "aborted" || session.status === "completed") {
      throw new ApiError(`Multipart session is ${session.status}`, 409);
    }
    if (input.partNumber < 1 || input.partNumber > 10000) {
      throw new ApiError("Invalid part number", 400);
    }
    const result = await this.storage.uploadPart(
      session.storageKey,
      session.uploadId,
      input.partNumber,
      input.bytes
    );
    if (!result.ok) {
      throw new ApiError(result.error.message || "Part upload failed", 500);
    }
    session.status = "uploading";
    const parts = [...(session.parts || [])].filter(
      (p) => p.partNumber !== input.partNumber
    );
    parts.push({
      partNumber: input.partNumber,
      etag: result.value.etag,
      sizeBytes: input.bytes.byteLength,
    });
    session.parts = parts;
    await session.save();
    return { partNumber: result.value.partNumber, etag: result.value.etag };
  }

  async getMultipartPartUrl(input: {
    userId: string;
    uploadId: string;
    partNumber: number;
  }): Promise<{ uploadUrl: string; expiresInSeconds: number }> {
    if (!supportsMultipart(this.storage)) {
      throw new ApiError("Multipart uploads not supported", 501);
    }
    const session = await this.requireMultipartSession(input.userId, input.uploadId);
    const createUrl = this.storage.createSignedUploadPartUrl;
    if (!createUrl) {
      throw new ApiError(
        "Presigned part URLs unavailable — use server-side part upload",
        501
      );
    }
    const signed = await createUrl(
      session.storageKey,
      session.uploadId,
      input.partNumber,
      SIGNED_TTL_SECONDS
    );
    if (!signed.ok) {
      throw new ApiError(signed.error.message || "Could not sign part URL", 500);
    }
    return { uploadUrl: signed.value, expiresInSeconds: SIGNED_TTL_SECONDS };
  }

  async completeMultipart(input: {
    userId: string;
    uploadId: string;
  }): Promise<ProductAssetDto> {
    if (!supportsMultipart(this.storage)) {
      throw new ApiError("Multipart uploads not supported", 501);
    }
    const session = await this.requireMultipartSession(input.userId, input.uploadId);
    if (session.status === "completed") {
      const doc = await MediaFile.findById(session.assetId);
      if (doc) return toProductAssetDto(doc);
    }
    const parts = (session.parts || [])
      .slice()
      .sort((a, b) => a.partNumber - b.partNumber)
      .map((p) => ({ partNumber: p.partNumber, etag: p.etag }));
    if (parts.length === 0) {
      throw new ApiError("No parts uploaded", 400);
    }
    const completed = await this.storage.completeMultipartUpload(
      session.storageKey,
      session.uploadId,
      parts
    );
    if (!completed.ok) {
      throw new ApiError(completed.error.message || "Complete failed", 500);
    }

    const sizeBytes =
      completed.value.size ||
      (session.parts || []).reduce((s, p) => s + (p.sizeBytes || 0), 0);

    const doc = await MediaFile.findById(session.assetId);
    if (!doc) throw new ApiError("Asset row missing", 500);
    doc.sizeBytes = sizeBytes;
    doc.checksum = completed.value.checksum;
    doc.etag = completed.value.checksum;
    doc.lifecycle = "published";
    doc.scanStatus = "skipped";
    await doc.save();

    session.status = "completed";
    session.checksum = completed.value.checksum;
    await session.save();

    void enqueuePostUploadJobs({
      organizationId: session.organizationId.toString(),
      assetId: doc._id.toString(),
      storageKey: session.storageKey,
      mimeType: session.mimeType,
      brandId: session.brandId?.toString(),
      assetName: session.filename,
    }).catch(() => undefined);

    void auditMediaAccess({
      action: "multipart_complete",
      organizationId: session.organizationId.toString(),
      userId: input.userId,
      assetId: doc._id.toString(),
      storageKey: session.storageKey,
    });

    void registerProductAssetBlobOwnership({
      storageKey: session.storageKey,
      organizationId: session.organizationId.toString(),
      assetId: doc._id.toString(),
      mimeType: session.mimeType,
      sizeBytes,
      checksum: completed.value.checksum,
    }).catch((err) => {
      console.warn(
        "[product-asset-service] blob ownership registration failed:",
        err instanceof Error ? err.message : err
      );
    });

    return toProductAssetDto(doc);
  }

  async abortMultipart(input: {
    userId: string;
    uploadId: string;
  }): Promise<{ uploadId: string; status: string }> {
    if (!supportsMultipart(this.storage)) {
      throw new ApiError("Multipart uploads not supported", 501);
    }
    const session = await this.requireMultipartSession(input.userId, input.uploadId);
    await this.storage.abortMultipartUpload(session.storageKey, session.uploadId);
    session.status = "aborted";
    await session.save();
    const doc = await MediaFile.findById(session.assetId);
    if (doc) {
      doc.status = "deleted";
      doc.lifecycle = "deleted";
      await doc.save();
    }
    return { uploadId: session.uploadId, status: "aborted" };
  }

  async attachToBrief(input: {
    userId: string;
    assetId: string;
    briefId: string;
  }): Promise<ProductAssetDto> {
    const doc = await this.requireOwnedAsset(input.userId, input.assetId);
    const orgId = doc.organizationId!.toString();
    await this.assertBriefOwnedByUser(input.briefId, input.userId, orgId);
    doc.briefId = new mongoose.Types.ObjectId(input.briefId);
    await doc.save();

    const brief = await Requirement.findById(input.briefId);
    if (brief) {
      const id = doc._id.toString();
      const files = Array.isArray(brief.files) ? [...brief.files.map(String)] : [];
      if (!files.includes(id)) {
        files.push(id);
        brief.files = files;
        await brief.save();
      }
    }
    return toProductAssetDto(doc);
  }

  async attachToProject(input: {
    userId: string;
    assetId: string;
    projectId: string;
  }): Promise<ProductAssetDto> {
    const doc = await this.requireOwnedAsset(input.userId, input.assetId);
    const orgId = doc.organizationId!.toString();
    await this.assertProjectInOrg(input.projectId, orgId, input.userId);
    doc.projectId = new mongoose.Types.ObjectId(input.projectId);
    await doc.save();
    return toProductAssetDto(doc);
  }

  private async requireMultipartSession(userId: string, uploadId: string) {
    const session = await MultipartUploadSession.findOne({ uploadId });
    if (!session) throw new ApiError("Multipart session not found", 404);
    if (session.expiresAt.getTime() < Date.now() && session.status !== "completed") {
      session.status = "expired";
      await session.save();
      throw new ApiError("Multipart session expired", 410);
    }
    await assertUserBelongsToOrganization(userId, session.organizationId.toString());
    return session;
  }

  private async requireOwnedAsset(
    userId: string,
    assetId: string
  ): Promise<IMediaFile> {
    if (!mongoose.isValidObjectId(assetId)) {
      throw new ApiError("Invalid asset id", 400);
    }
    const doc = await MediaFile.findById(assetId);
    if (!doc || doc.status === "deleted") {
      throw new ApiError("Asset not found", 404);
    }
    if (!doc.organizationId) {
      throw new ApiError("Asset has no organisation ownership", 403);
    }
    await assertUserBelongsToOrganization(
      userId,
      doc.organizationId.toString()
    );
    return doc;
  }

  private async assertProjectInOrg(
    projectId: string,
    organizationId: string,
    userId: string
  ): Promise<void> {
    const project = await Projects.findById(projectId);
    if (!project) throw new ApiError("Project not found", 404);
    if (project.userId.toString() !== userId) {
      throw new ApiError("Project does not belong to principal", 403);
    }
    if (project.orgId && project.orgId.toString() !== organizationId) {
      throw new ApiError("Project organisation mismatch", 403);
    }
  }

  private async assertBriefOwnedByUser(
    briefId: string,
    userId: string,
    organizationId: string
  ): Promise<void> {
    const brief = await Requirement.findById(briefId);
    if (!brief) throw new ApiError("Brief not found", 404);
    if (brief.userId.toString() !== userId) {
      throw new ApiError("Brief does not belong to principal", 403);
    }
    void organizationId;
  }
}

export const productAssetService = new ProductAssetService();

/** @deprecated — size validation moved to upload-pipeline; kept for call-site compat */
export function validateUploadMimeCategory(mime: string): MediaCategory {
  return inferMediaCategory(mime);
}
