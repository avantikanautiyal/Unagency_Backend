import multer from "multer";
import mongoose from "mongoose";
import Brands from "../models/brand.model";
import { dispatchClientNotification } from "../notifications/client-notification-service";
import { Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import { RequestUser } from "../types/user";
import { ApiError } from "../utils/apiError";
import {
  productAssetService,
  resolveCustomerOrganizationId,
} from "../services/product-asset-service";
import {
  DEFAULT_MEDIA_SIZE_LIMITS,
} from "../platform/media/ingestion/media-size-limits";

/** Memory multer — server remains authoritative; bytes go to IBlobStorage */
export const productAssetUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    // Align with video ceiling; finer MIME limits enforced in upload pipeline
    fileSize: DEFAULT_MEDIA_SIZE_LIMITS.videoMaxBytes,
    files: 1,
  },
});

function parseTagsBody(raw: unknown): string[] | undefined {
  if (Array.isArray(raw)) {
    const tags = raw.map(String).map((t) => t.trim()).filter(Boolean);
    return tags.length ? tags : undefined;
  }
  if (typeof raw === "string" && raw.trim()) {
    const trimmed = raw.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (Array.isArray(parsed)) {
          const tags = parsed.map(String).map((t) => t.trim()).filter(Boolean);
          return tags.length ? tags : undefined;
        }
      } catch {
        // fall through to comma-split
      }
    }
    const tags = trimmed
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    return tags.length ? tags : undefined;
  }
  return undefined;
}

export const uploadProductAsset = asyncHandler(
  async (req: RequestUser, res: Response) => {
    const file = req.file;
    if (!file) throw new ApiError("file is required", 400);
    const organizationId =
      (req.body?.organizationId as string | undefined) ||
      orgIdFromUser(req);
    const dto = await productAssetService.upload({
      userId: String(req.user!.userId),
      organizationId,
      filename: file.originalname || "file",
      mimeType: file.mimetype,
      bytes: file.buffer,
      projectId: req.body?.projectId as string | undefined,
      briefId: req.body?.briefId as string | undefined,
      brandId: req.body?.brandId as string | undefined,
      folder: req.body?.folder as string | undefined,
      tags: parseTagsBody(req.body?.tags ?? req.body?.tagsJson),
      tag: (req.body?.tag as string | undefined) || "product_asset",
      lifecycle: req.body?.lifecycle as
        | "temporary"
        | "draft"
        | "published"
        | "archived"
        | undefined,
      approvalStatus: req.body?.approvalStatus as
        | "none"
        | "pending"
        | "approved"
        | "rejected"
        | undefined,
      parentAssetId: req.body?.parentAssetId as string | undefined,
      executionId: req.body?.executionId as string | undefined,
    });
    if (dto.brandId && mongoose.isValidObjectId(dto.brandId)) {
      const brand = await Brands.findById(dto.brandId).select("name").lean();
      await dispatchClientNotification({
        eventKey: "BRAND_FILE_UPLOADED",
        userId: String(req.user!.userId),
        variables: { "File Name": dto.name, "Brand Name": brand?.name || "your brand" },
        primaryAction: { action: "/manage-brands" },
        entityType: "asset",
        entityId: dto.id,
        dedupeKey: dto.id,
      });
    } else if (dto.projectId || dto.briefId) {
      await dispatchClientNotification({
        eventKey: "FILE_UPLOADED",
        userId: String(req.user!.userId),
        variables: { "File Name": dto.name },
        primaryAction: {
          action: dto.projectId ? `/progress?projectId=${dto.projectId}` : "/progress",
        },
        entityType: "asset",
        entityId: dto.id,
        dedupeKey: dto.id,
      });
    } else if (parseTagsBody(req.body?.tags ?? req.body?.tagsJson)?.includes("onboarding-upload")) {
      await dispatchClientNotification({
        eventKey: "ORGANISATION_FILE_UPLOADED",
        userId: String(req.user!.userId),
        variables: { "File Name": dto.name },
        primaryAction: { action: "/vault" },
        entityType: "asset",
        entityId: dto.id,
        dedupeKey: dto.id,
      });
    }
    return new ApiResponse(200, dto, "Asset uploaded");
  }
);

/**
 * Copy a generated file (CDF rendered file or durable artifact) into Brand Vault
 * server-side. The client sends only ids, so file size is not bounded by proxy
 * request-body limits.
 */
export const importProductAsset = asyncHandler(
  async (req: RequestUser, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
    const renderedFileId = str(body.renderedFileId);
    const artifactId = str(body.artifactId);
    if (!renderedFileId && !artifactId) {
      throw new ApiError("renderedFileId or artifactId is required", 400);
    }
    const userId = String(req.user!.userId);
    const organizationId = await resolveCustomerOrganizationId(
      userId,
      str(body.organizationId) || orgIdFromUser(req)
    );
    if (!organizationId) throw new ApiError("Organization not found", 404);

    let bytes: Buffer;
    let mimeType: string;
    if (renderedFileId) {
      const { httpGetRenderedFileBytes } = await import("../platform/cdf/rendering");
      try {
        const got = await httpGetRenderedFileBytes({ fileId: renderedFileId, organizationId });
        bytes = Buffer.from(got.bytes);
        mimeType = got.file.mimeType;
      } catch (err) {
        throw new ApiError(err instanceof Error ? err.message : "Rendered file not found", 404);
      }
    } else {
      const { getEnterpriseApiRuntime } = await import(
        "../platform/api/runtime/bootstrap-enterprise-api"
      );
      const delivery =
        getEnterpriseApiRuntime()?.platform.durableStores?.asyncMedia?.mediaDelivery;
      if (!delivery) throw new ApiError("Media delivery unavailable", 503);
      const got = await delivery.resolveArtifactBinaryForTenant(artifactId!, organizationId, {
        ...(str(body.format) ? { format: str(body.format) } : {}),
      });
      if (!got.ok) throw new ApiError(got.error.message || "Artifact not found", 404);
      bytes = got.value.bytes;
      mimeType = got.value.contentType;
    }

    const ext = (mimeType.split("/")[1] || "bin").split(/[+;]/)[0];
    const dto = await productAssetService.upload({
      userId,
      organizationId,
      filename: str(body.filename) || `${(str(body.name) || "creative").replace(/[^a-zA-Z0-9-_]+/g, "-")}.${ext}`,
      mimeType,
      bytes,
      brandId: str(body.brandId),
      folder: str(body.folder),
      tags: parseTagsBody(body.tags),
      tag: "product_asset",
      trustedSource: true,
    });
    await dispatchClientNotification({
      eventKey: "SAVED_TO_VAULT",
      userId,
      variables: { "Asset Name": str(body.name) || dto.name },
      primaryAction: { action: "/vault" },
      entityType: "asset",
      entityId: dto.id,
      dedupeKey: dto.id,
    });
    const name = str(body.name);
    if (name) {
      try {
        const renamed = await productAssetService.updateMeta({
          userId,
          assetId: dto.id,
          patch: { name },
        });
        return new ApiResponse(200, renamed, "Asset imported");
      } catch {
        // name is cosmetic — keep the imported asset
      }
    }
    return new ApiResponse(200, dto, "Asset imported");
  }
);

function orgIdFromUser(req: RequestUser): string | undefined {
  const org = req.user?.organization as { _id?: { toString(): string } } | null;
  return org?._id?.toString();
}

export const listProductAssets = asyncHandler(
  async (req: RequestUser, res: Response) => {
    const organizationId =
      (req.query.organizationId as string | undefined) || orgIdFromUser(req);
    const data = await productAssetService.list({
      userId: req.user!.userId!,
      organizationId,
      brandId: req.query.brandId as string | undefined,
      folder: req.query.folder as string | undefined,
      q: req.query.q as string | undefined,
      sort: req.query.sort as "newest" | "oldest" | "name" | undefined,
      lifecycle: req.query.lifecycle as
        | "temporary"
        | "draft"
        | "published"
        | "archived"
        | undefined,
    });
    return new ApiResponse(200, data, "Assets fetched");
  }
);

export const updateProductAssetMeta = asyncHandler(
  async (req: RequestUser, res: Response) => {
    const data = await productAssetService.updateMeta({
      userId: req.user!.userId!,
      assetId: req.params.assetId,
      patch: {
        name: req.body?.name,
        folder: req.body?.folder,
        tags: req.body?.tags,
        brandId:
          req.body?.brandId === null
            ? null
            : (req.body?.brandId as string | undefined),
        lifecycle: req.body?.lifecycle,
        approvalStatus: req.body?.approvalStatus,
      },
    });
    return new ApiResponse(200, data, "Asset updated");
  }
);

export const getProductAsset = asyncHandler(
  async (req: RequestUser, res: Response) => {
    const data = await productAssetService.get({
      userId: req.user!.userId!,
      assetId: req.params.assetId,
    });
    return new ApiResponse(200, data, "Asset fetched");
  }
);

export const getProductAssetMedia = asyncHandler(
  async (req: RequestUser, res: Response) => {
    const disposition = (req.query.disposition as string | undefined) as
      | "inline"
      | "attachment"
      | "stream"
      | undefined;
    const refresh = req.query.refresh === "1" || req.query.refresh === "true";
    const data = await productAssetService.getMedia({
      userId: req.user!.userId!,
      assetId: req.params.assetId,
      disposition,
      refresh,
    });
    // The body carries a short-lived signed URL: a browser-cached copy (or a 304
    // keyed on the blob checksum) would hand back an expired link.
    res.setHeader("Cache-Control", "private, no-store");
    return new ApiResponse(200, data, "Media authorized");
  }
);

export const deleteProductAsset = asyncHandler(
  async (req: RequestUser, res: Response) => {
    const data = await productAssetService.delete({
      userId: req.user!.userId!,
      assetId: req.params.assetId,
    });
    return new ApiResponse(200, data, "Asset deleted");
  }
);

export const restoreProductAsset = asyncHandler(
  async (req: RequestUser, res: Response) => {
    const data = await productAssetService.restore({
      userId: req.user!.userId!,
      assetId: req.params.assetId,
    });
    return new ApiResponse(200, data, "Asset restored");
  }
);

export const attachProductAssetToBrief = asyncHandler(
  async (req: RequestUser, res: Response) => {
    const { briefId } = req.body as { briefId?: string };
    if (!briefId) throw new ApiError("briefId is required", 400);
    const data = await productAssetService.attachToBrief({
      userId: req.user!.userId!,
      assetId: req.params.assetId,
      briefId,
    });
    return new ApiResponse(200, data, "Asset attached to brief");
  }
);

export const attachProductAssetToProject = asyncHandler(
  async (req: RequestUser, res: Response) => {
    const { projectId } = req.body as { projectId?: string };
    if (!projectId) throw new ApiError("projectId is required", 400);
    const data = await productAssetService.attachToProject({
      userId: req.user!.userId!,
      assetId: req.params.assetId,
      projectId,
    });
    return new ApiResponse(200, data, "Asset attached to project");
  }
);

export const initiateMultipartUpload = asyncHandler(
  async (req: RequestUser, res: Response) => {
    const organizationId =
      (req.body?.organizationId as string | undefined) || orgIdFromUser(req);
    const data = await productAssetService.initiateMultipart({
      userId: String(req.user!.userId),
      organizationId,
      filename: String(req.body?.filename || "file"),
      mimeType: String(req.body?.mimeType || "application/octet-stream"),
      projectId: req.body?.projectId as string | undefined,
      briefId: req.body?.briefId as string | undefined,
      brandId: req.body?.brandId as string | undefined,
      folder: req.body?.folder as string | undefined,
    });
    return new ApiResponse(200, data, "Multipart initiated");
  }
);

export const uploadMultipartPart = asyncHandler(
  async (req: RequestUser, res: Response) => {
    const file = req.file;
    if (!file) throw new ApiError("file (part bytes) is required", 400);
    const partNumber = Number(req.body?.partNumber ?? req.params.partNumber);
    if (!Number.isFinite(partNumber)) {
      throw new ApiError("partNumber is required", 400);
    }
    const data = await productAssetService.uploadMultipartPart({
      userId: String(req.user!.userId),
      uploadId: req.params.uploadId,
      partNumber,
      bytes: file.buffer,
    });
    return new ApiResponse(200, data, "Part uploaded");
  }
);

export const getMultipartPartUrl = asyncHandler(
  async (req: RequestUser, res: Response) => {
    const partNumber = Number(req.query.partNumber ?? req.params.partNumber);
    if (!Number.isFinite(partNumber)) {
      throw new ApiError("partNumber is required", 400);
    }
    const data = await productAssetService.getMultipartPartUrl({
      userId: String(req.user!.userId),
      uploadId: req.params.uploadId,
      partNumber,
    });
    return new ApiResponse(200, data, "Part URL issued");
  }
);

export const completeMultipartUpload = asyncHandler(
  async (req: RequestUser, res: Response) => {
    const data = await productAssetService.completeMultipart({
      userId: String(req.user!.userId),
      uploadId: req.params.uploadId,
    });
    return new ApiResponse(200, data, "Multipart completed");
  }
);

export const abortMultipartUpload = asyncHandler(
  async (req: RequestUser, res: Response) => {
    const data = await productAssetService.abortMultipart({
      userId: String(req.user!.userId),
      uploadId: req.params.uploadId,
    });
    return new ApiResponse(200, data, "Multipart aborted");
  }
);
