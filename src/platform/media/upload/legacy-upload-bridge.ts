/**
 * M10.18 — Bridge legacy multer-S3 uploads into ProductAssetService.
 * Use from controllers that previously relied on public S3 URLs.
 */

import { productAssetService } from "../../services/product-asset-service";
import type { ProductAssetDto } from "../../services/product-asset-service";

export type LegacyUploadFile = {
  originalname?: string;
  mimetype?: string;
  buffer: Buffer;
};

/**
 * Convert a multer memory file into a private product asset.
 * Callers must switch middleware from multers3 → memoryStorage.
 */
export async function ingestLegacyUploadAsProductAsset(input: {
  userId: string;
  organizationId?: string;
  file: LegacyUploadFile;
  folder?: string;
  brandId?: string;
  projectId?: string;
  briefId?: string;
  tag?: string;
}): Promise<ProductAssetDto> {
  return productAssetService.upload({
    userId: input.userId,
    organizationId: input.organizationId,
    filename: input.file.originalname || "file",
    mimeType: input.file.mimetype || "application/octet-stream",
    bytes: input.file.buffer,
    folder: input.folder,
    brandId: input.brandId,
    projectId: input.projectId,
    briefId: input.briefId,
    tag: input.tag ?? "legacy_bridge",
  });
}
