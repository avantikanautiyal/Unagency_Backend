/**
 * Register product-asset storage keys in the tenant blob ownership registry.
 * Execution artifacts are registered on ingest; vault/brand assets were not —
 * video/image providers reject unregistered storageRef at signed-URL time.
 */

import mongoose from "mongoose";
import type { BlobOwnershipRecord } from "../platform/media/contracts/durable-blob-ref";
import { isDurableRuntimeEnabled } from "../platform/infrastructure/durability/durable-mode";
import { EnterpriseBlobMetadata } from "../platform/infrastructure/durability/mongo/models/enterprise-blob-metadata.model";

export async function registerProductAssetBlobOwnership(input: {
  readonly storageKey: string;
  readonly organizationId: string;
  readonly assetId: string;
  readonly mimeType?: string;
  readonly sizeBytes?: number;
  readonly checksum?: string;
  readonly executionId?: string;
}): Promise<void> {
  if (!input.storageKey.trim() || !input.organizationId.trim() || !input.assetId.trim()) {
    return;
  }
  if (!isDurableRuntimeEnabled()) return;
  if (mongoose.connection.readyState !== 1) return;

  const record: BlobOwnershipRecord = {
    storageKey: input.storageKey,
    organizationId: input.organizationId,
    artifactId: `product_asset_${input.assetId}`,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    checksum: input.checksum,
    executionId: input.executionId,
    createdAt: new Date().toISOString(),
  };

  await EnterpriseBlobMetadata.updateOne(
    { storageKey: record.storageKey },
    { $set: record },
    { upsert: true }
  );
}
