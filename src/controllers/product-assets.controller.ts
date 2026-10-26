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
    const vaultAssetId = str(body.vaultAssetId);
    if (!renderedFileId && !artifactId && !vaultAssetId) {
      throw new ApiError("renderedFileId, vaultAssetId or artifactId is required", 400);
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
    } else if (vaultAssetId) {
      // Approved CDF media (e.g. the final video) already lives as a MediaFile.
      const { createMediaFileVaultAssetResolver } = await import("../platform/cdf/rendering");
      const { getProductAssetBlobStorage } = await import("../services/product-asset-storage");
      const { getEnterpriseApiRuntime } = await import(
        "../platform/api/runtime/bootstrap-enterprise-api"
      );
      const MediaFile = (await import("../models/mediaFile.model")).default;
      const product = getProductAssetBlobStorage();
      const primary =
        getEnterpriseApiRuntime()?.platform.durableStores?.asyncMedia?.blobStorage ?? product;
      const got = await createMediaFileVaultAssetResolver({
        blobStorage: primary,
        fallbackBlobStorage: product !== primary ? product : undefined,
      }).resolve({ vaultAssetId, organizationId });
      if (!got) throw new ApiError("Vault asset not found", 404);
      const doc = await MediaFile.findById(vaultAssetId).select("mimeType").lean().exec();
      bytes = Buffer.from(got);
      mimeType = (doc as { mimeType?: string } | null)?.mimeType || "application/octet-stream";
      // The user downloaded a converted copy (e.g. PNG master as PDF/JPG) —
      // the vault keeps that same format, converted here, not re-uploaded.
      const format = str(body.format)?.toLowerCase().replace(/^jpeg$/, "jpg");
      const sourceExt = (mimeType.split("/")[1] || "").split(/[+;]/)[0].replace(/^jpeg$/, "jpg");
      if (format && format !== sourceExt) {
        // The download just made this exact copy — re-converting a
        // print-size master here ran past the proxy timeout ("couldn't reach").
        const exported = await productAssetService
          .readExportedCopy({ assetId: vaultAssetId, format })
          .catch(() => null);
        if (exported) {
          bytes = exported.bytes;
          mimeType = exported.contentType;
        } else {
          const { convertMediaBytes } = await import("../services/product-asset-service");
          const converted = await convertMediaBytes({ bytes, sourceMime: mimeType, format });
          bytes = converted.bytes;
          mimeType = converted.contentType;
        }
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
    // Notifications (push / email) must not hold the save's response.
    void dispatchClientNotification({
      eventKey: "SAVED_TO_VAULT",
      userId,
      variables: { "Asset Name": str(body.name) || dto.name },
      primaryAction: { action: "/vault" },
      entityType: "asset",
      entityId: dto.id,
      dedupeKey: dto.id,
    }).catch(() => undefined);
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

/** Vault asset in another download format (JPG/PNG/PDF, HTML→PDF/PNG, video→GIF, text→PDF/DOCX). */
export const exportProductAssetMedia = asyncHandler(
  async (req: RequestUser, res: Response) => {
    const format = String(req.query.format ?? "").trim();
    if (!format) throw new ApiError("format is required", 400);
    const data = await productAssetService.exportMedia({
      userId: req.user!.userId!,
      assetId: req.params.assetId,
      format,
    });
    res.setHeader("Cache-Control", "private, no-store");
    return new ApiResponse(200, data, "Export authorized");
  }
);

/** Chat-text deliverable (copy, naming, UX strategy) → PDF / DOCX download or Vault save. */
export const exportProductText = asyncHandler(
  async (req: RequestUser, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const formats = Array.isArray(body.formats)
      ? body.formats.map(String)
      : typeof body.format === "string"
        ? [body.format]
        : [];
    const data = await productAssetService.exportText({
      userId: req.user!.userId!,
      organizationId:
        (typeof body.organizationId === "string" && body.organizationId) ||
        orgIdFromUser(req),
      text: typeof body.text === "string" ? body.text : "",
      title: typeof body.title === "string" ? body.title : undefined,
      formats,
      saveToVault: body.saveToVault === true,
      brandId: typeof body.brandId === "string" ? body.brandId : undefined,
    });
    res.setHeader("Cache-Control", "private, no-store");
    return new ApiResponse(200, data, "Text exported");
  }
);

/**
 * Multi-page deliverable (brochure, leaflet, storyboard): ordered designed page
 * images → one PDF (printer spreads for folded layouts). Download URL, or saved
 * to the Brand Vault.
 */
export const composePagesPdf = asyncHandler(
  async (req: RequestUser, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
    const pages = Array.isArray(body.pages) ? (body.pages as Record<string, unknown>[]) : [];
    if (pages.length === 0) throw new ApiError("pages are required", 400);
    if (pages.length > 32) throw new ApiError("Too many pages (max 32)", 413);
    const layoutRaw = str(body.layout) ?? "pages";
    const layout = (["pages", "bi-fold", "tri-fold", "z-fold", "storyboard"].includes(layoutRaw)
      ? layoutRaw
      : "pages") as import("../platform/media/delivery/pages-pdf-composer").PagesPdfLayout;
    const userId = String(req.user!.userId);
    const organizationId = await resolveCustomerOrganizationId(
      userId,
      str(body.organizationId) || orgIdFromUser(req)
    );
    if (!organizationId) throw new ApiError("Organization not found", 404);

    const { getEnterpriseApiRuntime } = await import(
      "../platform/api/runtime/bootstrap-enterprise-api"
    );
    const platform = getEnterpriseApiRuntime()?.platform;
    const delivery = platform?.durableStores?.asyncMedia?.mediaDelivery;
    const artifactsRepo = platform?.durableStores?.artifacts;
    if (!delivery) throw new ApiError("Media delivery unavailable", 503);

    /** Image bytes for one page — explicit art_* id, else the job's media file. */
    const pageImage = async (page: Record<string, unknown>, n: number): Promise<Buffer> => {
      const candidates: string[] = [];
      const explicit = str(page.artifactId);
      if (explicit && !explicit.startsWith("cdfart_")) candidates.push(explicit);
      const executionId = str(page.executionId);
      if (executionId && artifactsRepo) {
        const listed = await artifactsRepo.list(executionId);
        for (const a of listed) {
          if (a.artifactId && a.label?.startsWith("blob:")) candidates.push(a.artifactId);
        }
      }
      for (const artifactId of candidates) {
        const got = await delivery.resolveArtifactBinaryForTenant(artifactId, organizationId);
        if (got.ok && /^image\/(png|jpe?g)/i.test(got.value.contentType)) {
          return Buffer.from(got.value.bytes);
        }
        // Other raster types (e.g. webp) → PNG for the PDF.
        if (got.ok && got.value.contentType.startsWith("image/")) {
          const png = await delivery.resolveArtifactBinaryForTenant(artifactId, organizationId, {
            format: "png",
          });
          if (png.ok) return Buffer.from(png.value.bytes);
        }
      }
      throw new ApiError(`Page ${n} image is not available — regenerate that page and retry.`, 404);
    };

    const images: { bytes: Buffer; caption?: string }[] = [];
    for (let i = 0; i < pages.length; i += 1) {
      images.push({ bytes: await pageImage(pages[i]!, i + 1), caption: str(pages[i]!.caption) });
    }
    const { composePagesPdf: compose } = await import(
      "../platform/media/delivery/pages-pdf-composer"
    );
    const title = str(body.title) || "Document";
    const pdf = await compose({ title, layout, pages: images });
    const filename = `${title.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "document"}.pdf`;

    if (body.saveToVault === true) {
      const dto = await productAssetService.upload({
        userId,
        organizationId,
        filename,
        mimeType: "application/pdf",
        bytes: pdf,
        brandId: str(body.brandId),
        folder: "documents",
        tags: ["page-document", `layout:${layout}`],
        tag: "product_asset",
        trustedSource: true,
      });
      const media = await productAssetService.getMedia({
        userId,
        assetId: dto.id,
        disposition: "attachment",
      });
      res.setHeader("Cache-Control", "private, no-store");
      return new ApiResponse(200, { mediaUrl: media.mediaUrl, vaultAsset: dto }, "PDF saved");
    }
    const url = await productAssetService.storeTransientExport({
      userId,
      bytes: pdf,
      contentType: "application/pdf",
      filename,
    });
    res.setHeader("Cache-Control", "private, no-store");
    return new ApiResponse(200, { mediaUrl: url }, "PDF ready");
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

/**
 * GET /assets/download?url=&name= — streams one of our stored files back as an
 * attachment so the web app can save it to the computer (S3 has no CORS rule
 * for the web origin, so the browser cannot fetch it directly).
 */
export const downloadStoredFile = asyncHandler(
  async (req: RequestUser, res: Response) => {
    const url = typeof req.query.url === "string" ? req.query.url.trim() : "";
    const name = typeof req.query.name === "string" ? req.query.name : undefined;
    if (!url) throw new ApiError("url is required", 400);
    const { openProxiedDownload, attachmentDisposition, DownloadProxyError } = await import(
      "../services/file-download-proxy"
    );
    let file: Awaited<ReturnType<typeof openProxiedDownload>>;
    try {
      file = await openProxiedDownload({ url, name });
    } catch (err) {
      if (err instanceof DownloadProxyError) throw new ApiError(err.message, err.status);
      throw new ApiError("File fetch failed", 502);
    }
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Disposition", attachmentDisposition(file.fileName));
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.setHeader("Cache-Control", "private, no-store");
    if (file.contentLength) res.setHeader("Content-Length", String(file.contentLength));
    const { Readable } = await import("node:stream");
    const { pipeline } = await import("node:stream/promises");
    try {
      await pipeline(
        Readable.fromWeb(file.body as import("node:stream/web").ReadableStream<Uint8Array>),
        res,
      );
    } catch (err) {
      // Headers are already sent — the browser sees a cut-off download.
      console.warn(
        `[assets.download] stream aborted | ${err instanceof Error ? err.message : String(err)}`,
      );
      res.destroy();
    }
  }
);
