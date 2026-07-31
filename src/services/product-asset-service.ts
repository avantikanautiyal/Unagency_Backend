/**
 * Product asset domain service (M10.4).
 * Metadata: MediaFile. Bytes: IBlobStorage (server-controlled keys).
 */

import mongoose from "mongoose";
import MediaFile, {
  type IMediaFile,
  type ProductAssetKind,
} from "../models/mediaFile.model";
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
  maxBytesForCategory,
  type MediaCategory,
} from "../platform/media/ingestion/media-size-limits";

const SIGNED_TTL_SECONDS = Math.min(
  Number(process.env.ENTERPRISE_BLOB_SIGNED_URL_TTL_SECONDS ?? 300) || 300,
  3600
);

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "video/mp4",
  "audio/mpeg",
  "audio/wav",
]);

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
  status: string;
  preview?: { available: boolean };
};

function kindFromMime(mime: string): ProductAssetKind {
  const cat = inferMediaCategory(mime);
  if (cat === "image") return "image";
  if (cat === "video") return "video";
  if (cat === "audio") return "audio";
  if (
    mime === "application/pdf" ||
    mime.startsWith("text/") ||
    mime.includes("document") ||
    mime.includes("presentation")
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
    status: doc.status ?? "active",
    preview: { available: (doc.kind || "other") === "image" },
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

function validateUpload(input: {
  mimeType: string;
  sizeBytes: number;
  filename: string;
}): { kind: ProductAssetKind; category: MediaCategory } {
  const filename = sanitizeFilename(input.filename);
  if (!filename) throw new ApiError("Invalid filename", 400);
  if (input.sizeBytes <= 0) throw new ApiError("Zero-byte uploads are rejected", 400);
  const mime = (input.mimeType || "").toLowerCase().trim();
  if (!mime || !ALLOWED_MIME.has(mime)) {
    throw new ApiError("MIME type not allowed", 400);
  }
  const category = inferMediaCategory(mime);
  const max = maxBytesForCategory(category, DEFAULT_MEDIA_SIZE_LIMITS);
  if (input.sizeBytes > max) {
    throw new ApiError(`File exceeds size limit (${max} bytes)`, 400);
  }
  return { kind: kindFromMime(mime), category };
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
    tag?: string;
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

    const { kind } = validateUpload({
      mimeType: input.mimeType,
      sizeBytes: input.bytes.byteLength,
      filename: input.filename,
    });

    if (input.projectId) {
      await this.assertProjectInOrg(input.projectId, organizationId, input.userId);
    }
    if (input.briefId) {
      await this.assertBriefOwnedByUser(input.briefId, input.userId, organizationId);
    }

    const assetId = new mongoose.Types.ObjectId();
    const safeName = sanitizeFilename(input.filename);
    const storageKey = buildProductAssetStorageKey({
      organizationId,
      assetId: assetId.toString(),
      filename: safeName,
    });

    const put = await this.storage.put(
      storageKey,
      input.bytes,
      input.mimeType
    );
    if (!put.ok) {
      throw new ApiError(put.error.message || "Blob put failed", 500);
    }

    try {
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
        mimeType: input.mimeType,
        sizeBytes: input.bytes.byteLength,
        kind,
        status: "active",
        checksum: undefined,
        uploadedAt: new Date(),
      });
      return toProductAssetDto(doc);
    } catch (err) {
      await this.storage.delete(storageKey).catch(() => undefined);
      throw err;
    }
  }

  async list(input: {
    userId: string;
    organizationId?: string;
  }): Promise<ProductAssetDto[]> {
    const organizationId = await resolveCustomerOrganizationId(
      input.userId,
      input.organizationId
    );
    const docs = await MediaFile.find({
      organizationId: new mongoose.Types.ObjectId(organizationId),
      status: { $ne: "deleted" },
      storageKey: { $exists: true, $ne: null },
    });
    const sorted = [...docs].sort((a: any, b: any) => {
      const at = new Date(a.createdAt || a.uploadedAt || 0).getTime();
      const bt = new Date(b.createdAt || b.uploadedAt || 0).getTime();
      return bt - at;
    });
    return sorted.map(toProductAssetDto);
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
  }): Promise<{ mediaUrl: string; expiresInSeconds: number; contentType: string }> {
    const doc = await this.requireOwnedAsset(input.userId, input.assetId);
    if (!doc.storageKey) {
      // Legacy public URL fallback — not preferred
      if (doc.url && !doc.url.startsWith("blob:")) {
        return {
          mediaUrl: doc.url,
          expiresInSeconds: 0,
          contentType: doc.mimeType || "application/octet-stream",
        };
      }
      throw new ApiError("Asset has no durable storage key", 404);
    }
    if (!this.storage.createSignedGetUrl) {
      throw new ApiError("Signed media delivery unavailable", 503);
    }
    const signed = await this.storage.createSignedGetUrl(
      doc.storageKey,
      SIGNED_TTL_SECONDS
    );
    if (!signed.ok) {
      throw new ApiError(signed.error.message || "Could not sign media URL", 500);
    }
    return {
      mediaUrl: signed.value,
      expiresInSeconds: SIGNED_TTL_SECONDS,
      contentType: doc.mimeType || "application/octet-stream",
    };
  }

  async delete(input: {
    userId: string;
    assetId: string;
  }): Promise<{ id: string; status: string }> {
    const doc = await this.requireOwnedAsset(input.userId, input.assetId);
    doc.status = "deleted";
    await doc.save();
    // Soft-delete metadata; best-effort blob delete (single-owner invariant)
    if (doc.storageKey) {
      await this.storage.delete(doc.storageKey).catch(() => undefined);
    }
    return { id: doc._id.toString(), status: "deleted" };
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
    // Briefs are user-scoped; organisation membership already validated for asset.
    void organizationId;
  }
}

export const productAssetService = new ProductAssetService();
