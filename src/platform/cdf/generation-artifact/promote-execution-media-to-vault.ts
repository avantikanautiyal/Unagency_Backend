/**
 * Promote execution media (art_*) into a durable Vault ObjectId (MediaFile._id).
 *
 * CDF canonical image artifacts require previewAssetRef.vaultAssetId as a 24-hex
 * ObjectId — never art_*, exec_*, or URL values. Reuses the already-ingested blob
 * storageKey (no byte re-upload) and registers a MediaFile row + ownership linkage.
 */

import mongoose from "mongoose";
import MediaFile from "../../../models/mediaFile.model";
import { isVaultAssetObjectIdShape } from "../artifacts/ids";
import { parseStorageRefKey } from "../../media/blob/tenant-blob-key-builder";
import { registerProductAssetBlobOwnership } from "../../../services/register-product-asset-blob-ownership";
import type { AsyncMediaPlatform } from "../../infrastructure/durability/create-async-media-platform";

export type PromoteExecutionMediaToVaultResult =
  | {
      ok: true;
      vaultAssetId: string;
      storageKey: string;
      mediaArtifactId: string;
      mimeType?: string;
    }
  | { ok: false; reason: string; mediaArtifactId?: string };

/**
 * Resolve art_* → blob:storageKey label using the same authority as vault promote.
 * Exported so deterministic composition can load bytes without a parallel resolver.
 */
export async function resolveExecutionMediaBlob(input: {
  mediaArtifactId: string;
  organizationId: string;
  asyncMedia: AsyncMediaPlatform;
}): Promise<
  | {
      ok: true;
      label: string;
      mimeType?: string;
      sizeBytes?: number;
      checksum?: string;
    }
  | { ok: false; reason: string }
> {
  // 1) Enterprise artifact row (art_* → blob:storageKey)
  try {
    if (mongoose.connection.readyState === 1) {
      const { EnterpriseArtifact } = await import(
        "../../infrastructure/durability/mongo/models/enterprise-artifact.model"
      );
      const doc = await EnterpriseArtifact.findOne({
        artifactId: input.mediaArtifactId,
      })
        .lean()
        .exec();
      const label = (doc as { label?: string } | null)?.label;
      if (typeof label === "string" && label.startsWith("blob:")) {
        return { ok: true, label };
      }
    }
  } catch {
    // continue
  }

  // 2) Blob ownership keyed by artifactId (set at media ingest)
  try {
    if (mongoose.connection.readyState === 1) {
      const { EnterpriseBlobMetadata } = await import(
        "../../infrastructure/durability/mongo/models/enterprise-blob-metadata.model"
      );
      const meta = await EnterpriseBlobMetadata.findOne({
        artifactId: input.mediaArtifactId,
        organizationId: input.organizationId,
      })
        .lean()
        .exec();
      const storageKey = (meta as { storageKey?: string } | null)?.storageKey;
      if (typeof storageKey === "string" && storageKey.trim()) {
        return {
          ok: true,
          label: `blob:${storageKey}`,
          mimeType: (meta as { mimeType?: string }).mimeType,
          sizeBytes: (meta as { sizeBytes?: number }).sizeBytes,
          checksum: (meta as { checksum?: string }).checksum,
        };
      }
    }
  } catch {
    // continue
  }

  // 3) In-process MediaArtifactService finalized map (same process, tests / warm path)
  try {
    const svc = input.asyncMedia.artifacts as unknown as {
      listFinalized?: (operationId: string) => readonly {
        artifactId: string;
        blob: {
          storageKey: string;
          mimeType?: string;
          sizeBytes?: number;
          checksum?: string;
        };
      }[];
    };
    // MediaArtifactService does not expose get-by-artifactId; scan via private map
    const finalized = (
      input.asyncMedia.artifacts as unknown as {
        finalized?: Map<
          string,
          {
            artifactId: string;
            blob: {
              storageKey: string;
              mimeType?: string;
              sizeBytes?: number;
              checksum?: string;
            };
          }
        >;
      }
    ).finalized;
    if (finalized) {
      for (const row of finalized.values()) {
        if (row.artifactId === input.mediaArtifactId && row.blob?.storageKey) {
          return {
            ok: true,
            label: `blob:${row.blob.storageKey}`,
            mimeType: row.blob.mimeType,
            sizeBytes: row.blob.sizeBytes,
            checksum: row.blob.checksum,
          };
        }
      }
    }
    void svc;
  } catch {
    // continue
  }

  return { ok: false, reason: "execution_media_artifact_not_found" };
}

export async function promoteExecutionMediaArtifactToVaultAsset(input: {
  mediaArtifactId: string;
  organizationId: string;
  executionId: string;
  userId?: string;
  asyncMedia: AsyncMediaPlatform;
}): Promise<PromoteExecutionMediaToVaultResult> {
  const mediaArtifactId = input.mediaArtifactId.trim();
  if (!mediaArtifactId) {
    return { ok: false, reason: "missing_media_artifact_id" };
  }
  if (isVaultAssetObjectIdShape(mediaArtifactId)) {
    return {
      ok: true,
      vaultAssetId: mediaArtifactId,
      storageKey: "",
      mediaArtifactId,
    };
  }
  if (!mediaArtifactId.startsWith("art_")) {
    return {
      ok: false,
      reason: "not_execution_media_artifact",
      mediaArtifactId,
    };
  }

  const resolved = await resolveExecutionMediaBlob({
    mediaArtifactId,
    organizationId: input.organizationId,
    asyncMedia: input.asyncMedia,
  });
  if (!resolved.ok) {
    return {
      ok: false,
      reason: resolved.reason,
      mediaArtifactId,
    };
  }

  const storageKey = parseStorageRefKey(resolved.label);
  if (!storageKey) {
    return {
      ok: false,
      reason: "invalid_blob_storage_key",
      mediaArtifactId,
    };
  }

  let mimeType = resolved.mimeType;
  let sizeBytes = resolved.sizeBytes;
  let checksum = resolved.checksum;
  try {
    const owned = await input.asyncMedia.blobMetadata.resolveForTenant(
      storageKey,
      input.organizationId,
    );
    if (owned) {
      mimeType = owned.mimeType ?? mimeType;
      sizeBytes = owned.sizeBytes ?? sizeBytes;
      checksum = owned.checksum ?? checksum;
    }
  } catch {
    // optional
  }

  const vaultObjectId = new mongoose.Types.ObjectId();
  const vaultAssetId = vaultObjectId.toHexString();
  const now = new Date();

  try {
    if (mongoose.connection.readyState === 1) {
      const orgOid = mongoose.isValidObjectId(input.organizationId)
        ? new mongoose.Types.ObjectId(input.organizationId)
        : undefined;
      const userOid =
        input.userId && mongoose.isValidObjectId(input.userId)
          ? new mongoose.Types.ObjectId(input.userId)
          : undefined;

      await MediaFile.create({
        _id: vaultObjectId,
        url: resolved.label,
        fileName: `${mediaArtifactId}.png`,
        tag: "cdf-canonical-preview",
        storageKey,
        ...(orgOid ? { organizationId: orgOid } : {}),
        ...(userOid ? { uploaderUserId: userOid } : {}),
        mimeType: mimeType ?? "image/png",
        sizeBytes: sizeBytes ?? 0,
        kind: "image",
        status: "active",
        lifecycle: "draft",
        checksum,
        executionId: input.executionId,
        uploadedAt: now,
      });

      await registerProductAssetBlobOwnership({
        storageKey,
        organizationId: input.organizationId,
        assetId: vaultAssetId,
        mimeType: mimeType ?? "image/png",
        sizeBytes: sizeBytes ?? 0,
        checksum,
        executionId: input.executionId,
      });
    } else {
      const g = globalThis as typeof globalThis & {
        __cdfVaultPromoteMap?: Map<string, string>;
      };
      if (!g.__cdfVaultPromoteMap) g.__cdfVaultPromoteMap = new Map();
      g.__cdfVaultPromoteMap.set(mediaArtifactId, vaultAssetId);
    }
  } catch (err) {
    return {
      ok: false,
      reason: `vault_mediafile_create_failed:${err instanceof Error ? err.message : String(err)}`,
      mediaArtifactId,
    };
  }

  return {
    ok: true,
    vaultAssetId,
    storageKey,
    mediaArtifactId,
    mimeType: mimeType ?? "image/png",
  };
}
