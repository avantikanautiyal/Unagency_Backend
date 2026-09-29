/**
 * Persist composed deliverable bytes into blob storage + Vault preview id.
 * Load raw provider art_* bytes via the same resolution authority as vault promote.
 *
 * Generic — no service/platform/provider branches.
 *
 * Authoritative identity chain:
 *   composed bytes → blob put → artifacts.finalize → returned artifactId
 *   → promote(that artifactId) → MediaFile/VaultAsset ObjectId
 *
 * Synthetic / invented art_composed_* identities are never OCR-ready and must
 * never be surfaced as previewAssetRef.vaultAssetId.
 */

import { createHash } from "crypto";
import type { AsyncMediaPlatform } from "../../infrastructure/durability/create-async-media-platform";
import {
  promoteExecutionMediaArtifactToVaultAsset,
  resolveExecutionMediaBlob,
} from "../generation-artifact/promote-execution-media-to-vault";
import { parseStorageRefKey } from "../../media/blob/tenant-blob-key-builder";
import { logCdfAssetByteLifecycle } from "../diagnostics/asset-byte-lifecycle-log";

const g = globalThis as typeof globalThis & {
  __cdfVaultPromoteMap?: Map<string, string>;
  __cdfVaultBytesMap?: Map<string, { bytes: Buffer; mimeType: string }>;
};

function ensureMaps(): void {
  if (!g.__cdfVaultPromoteMap) g.__cdfVaultPromoteMap = new Map();
  if (!g.__cdfVaultBytesMap) g.__cdfVaultBytesMap = new Map();
}

/**
 * Load bytes for a materialized execution media artifact (art_syncimg_*, art_*, …).
 *
 * Uses the same blob-label resolution as vault promote, then reads via IBlobStorage
 * Result<{ data: base64 }> — the contract every other media path already uses.
 */
export async function loadExecutionMediaBytes(input: {
  readonly mediaArtifactId: string;
  readonly organizationId: string;
  readonly asyncMedia: AsyncMediaPlatform;
}): Promise<
  | { ok: true; bytes: Buffer; mimeType: string; storageKey: string }
  | { ok: false; reason: string }
> {
  const mediaArtifactId = input.mediaArtifactId.trim();
  if (!mediaArtifactId) {
    return { ok: false, reason: "missing_media_artifact_id" };
  }

  const resolved = await resolveExecutionMediaBlob({
    mediaArtifactId,
    organizationId: input.organizationId,
    asyncMedia: input.asyncMedia,
  });
  if (!resolved.ok) {
    return { ok: false, reason: resolved.reason };
  }

  const storageKey = parseStorageRefKey(resolved.label);
  if (!storageKey) {
    return { ok: false, reason: "invalid_blob_storage_key" };
  }

  try {
    const got = await input.asyncMedia.blobStorage.get(storageKey);
    if (!got.ok) {
      return {
        ok: false,
        reason: `blob_get_failed:${String(
          (got as { error?: { message?: string } }).error?.message ?? "unknown",
        ).slice(0, 120)}`,
      };
    }
    if (!got.value || typeof got.value.data !== "string") {
      return { ok: false, reason: "blob_bytes_missing" };
    }
    const bytes = Buffer.from(got.value.data, "base64");
    if (bytes.length < 8) {
      return { ok: false, reason: "blob_bytes_missing" };
    }
    return {
      ok: true,
      bytes,
      mimeType:
        resolved.mimeType ??
        got.value.contentType ??
        "image/png",
      storageKey,
    };
  } catch (err) {
    return {
      ok: false,
      reason:
        err instanceof Error
          ? `load_media_failed:${err.message.slice(0, 120)}`
          : "load_media_failed",
    };
  }
}

/**
 * Store composed PNG and return a durable Vault ObjectId for canonical candidate.
 *
 * Fail-closed: blob put, finalize, and promote must all succeed. A synthetic
 * hash-derived id is never returned as vaultAssetId / OCR-ready identity.
 */
export async function persistComposedDeliverableToVault(input: {
  readonly composedBytes: Buffer;
  readonly mimeType: string;
  readonly executionId: string;
  readonly organizationId: string;
  readonly userId?: string;
  readonly asyncMedia: AsyncMediaPlatform;
}): Promise<
  | {
      ok: true;
      mediaArtifactId: string;
      vaultAssetId: string;
      contentHash: string;
    }
  | { ok: false; reason: string }
> {
  ensureMaps();
  const contentHash = createHash("sha256")
    .update(input.composedBytes)
    .digest("hex");
  const compositionOutputStorageKey = `composed/${input.organizationId}/${input.executionId}/${contentHash}.png`;
  const tenantScope = { organizationId: input.organizationId };

  logCdfAssetByteLifecycle({
    boundary: "persist_composed.enter",
    executionId: input.executionId,
    compositionOutputStorageKey,
    storageKey: compositionOutputStorageKey,
    tenantScope,
    mimeType: input.mimeType,
    byteLength: input.composedBytes.length,
    referenceExists: true,
    referenceResolves: false,
    bytesExist: input.composedBytes.length > 0,
  });

  try {
    const put = await input.asyncMedia.blobStorage.put(
      compositionOutputStorageKey,
      input.composedBytes,
      input.mimeType,
    );
    if (!put.ok) {
      logCdfAssetByteLifecycle({
        boundary: "persist_composed.blob_put_failed",
        executionId: input.executionId,
        compositionOutputStorageKey,
        storageKey: compositionOutputStorageKey,
        tenantScope,
        mimeType: input.mimeType,
        byteLength: input.composedBytes.length,
        referenceExists: true,
        referenceResolves: false,
        bytesExist: false,
        resolverResult: "composed_blob_put_failed",
      });
      return {
        ok: false,
        reason: `composed_blob_put_failed:${String(
          (put as { error?: { message?: string } }).error?.message ?? "unknown",
        ).slice(0, 120)}`,
      };
    }
  } catch (err) {
    logCdfAssetByteLifecycle({
      boundary: "persist_composed.blob_put_exception",
      executionId: input.executionId,
      compositionOutputStorageKey,
      storageKey: compositionOutputStorageKey,
      tenantScope,
      mimeType: input.mimeType,
      byteLength: input.composedBytes.length,
      referenceExists: true,
      referenceResolves: false,
      bytesExist: false,
      resolverResult:
        err instanceof Error ? err.message.slice(0, 120) : "composed_blob_put_failed",
    });
    return {
      ok: false,
      reason:
        err instanceof Error
          ? `composed_blob_put_failed:${err.message.slice(0, 120)}`
          : "composed_blob_put_failed",
    };
  }

  logCdfAssetByteLifecycle({
    boundary: "persist_composed.blob_put_ok",
    executionId: input.executionId,
    compositionOutputStorageKey,
    storageKey: compositionOutputStorageKey,
    tenantScope,
    mimeType: input.mimeType,
    byteLength: input.composedBytes.length,
    referenceExists: true,
    referenceResolves: true,
    bytesExist: true,
    resolverResult: "blob_put_ok",
  });

  let finalizedArtifactId: string | null = null;
  try {
    const finalized = await input.asyncMedia.artifacts.finalize({
      operationId: input.executionId,
      executionId: input.executionId,
      organizationId: input.organizationId,
      outputIndex: 97,
      blob: {
        blobId: `blob_composed_${contentHash.slice(0, 16)}_97`,
        storageKey: compositionOutputStorageKey,
        organizationId: input.organizationId,
        mimeType: input.mimeType,
        sizeBytes: input.composedBytes.length,
        checksum: contentHash,
        createdAt: new Date().toISOString(),
      },
      providerId: "composition",
      modelId: "deterministic",
      capabilityId: "deterministic_composition",
    });
    finalizedArtifactId =
      finalized && typeof (finalized as { artifactId?: string }).artifactId === "string"
        ? String((finalized as { artifactId: string }).artifactId).trim()
        : null;
  } catch (finalizeErr) {
    logCdfAssetByteLifecycle({
      boundary: "persist_composed.finalize_exception",
      executionId: input.executionId,
      compositionOutputStorageKey,
      storageKey: compositionOutputStorageKey,
      tenantScope,
      mimeType: input.mimeType,
      byteLength: input.composedBytes.length,
      referenceExists: true,
      referenceResolves: false,
      bytesExist: true,
      resolverResult:
        finalizeErr instanceof Error
          ? finalizeErr.message.slice(0, 120)
          : "finalize_exception",
    });
    return {
      ok: false,
      reason:
        finalizeErr instanceof Error
          ? `composed_finalize_failed:${finalizeErr.message.slice(0, 120)}`
          : "composed_finalize_failed",
    };
  }

  if (!finalizedArtifactId) {
    logCdfAssetByteLifecycle({
      boundary: "persist_composed.finalize_missing_artifact_id",
      executionId: input.executionId,
      compositionOutputStorageKey,
      storageKey: compositionOutputStorageKey,
      tenantScope,
      mimeType: input.mimeType,
      byteLength: input.composedBytes.length,
      referenceExists: false,
      referenceResolves: false,
      bytesExist: true,
      resolverResult: "finalize_missing_artifact_id",
    });
    return { ok: false, reason: "composed_finalize_missing_artifact_id" };
  }

  // Authoritative media identity = finalize return value (e.g. art_{exec}_97).
  // Never invent a parallel art_composed_{hash} identity for promote / OCR.
  const mediaArtifactId = finalizedArtifactId;

  logCdfAssetByteLifecycle({
    boundary: "persist_composed.after_finalize",
    executionId: input.executionId,
    compositionOutputRef: mediaArtifactId,
    compositionOutputStorageKey,
    mediaArtifactId,
    finalizedArtifactId,
    storageKey: compositionOutputStorageKey,
    tenantScope,
    mimeType: input.mimeType,
    byteLength: input.composedBytes.length,
    referenceExists: true,
    referenceResolves: true,
    bytesExist: true,
    resolverResult: "finalize_ok",
    extra: {
      noPhantomArtComposedId: true,
    },
  });

  let promotedVaultAssetId: string | null = null;
  try {
    const promoted = await promoteExecutionMediaArtifactToVaultAsset({
      mediaArtifactId,
      organizationId: input.organizationId,
      executionId: input.executionId,
      userId: input.userId,
      asyncMedia: input.asyncMedia,
    });
    if (!promoted.ok) {
      logCdfAssetByteLifecycle({
        boundary: "persist_composed.promote_failed",
        executionId: input.executionId,
        compositionOutputRef: mediaArtifactId,
        compositionOutputStorageKey,
        mediaArtifactId,
        finalizedArtifactId,
        promotedVaultAssetId: null,
        mediaFileId: null,
        previewAssetRef: null,
        storageKey: compositionOutputStorageKey,
        tenantScope,
        mimeType: input.mimeType,
        byteLength: input.composedBytes.length,
        referenceExists: true,
        referenceResolves: false,
        bytesExist: true,
        resolverResult: `promote_failed:${promoted.reason}`,
      });
      return {
        ok: false,
        reason: `composed_vault_promote_failed:${promoted.reason}`,
      };
    }

    promotedVaultAssetId = promoted.vaultAssetId;
    g.__cdfVaultBytesMap!.set(promoted.vaultAssetId, {
      bytes: input.composedBytes,
      mimeType: input.mimeType,
    });
    g.__cdfVaultPromoteMap!.set(mediaArtifactId, promoted.vaultAssetId);

    logCdfAssetByteLifecycle({
      boundary: "persist_composed.promote_ok",
      executionId: input.executionId,
      compositionOutputRef: mediaArtifactId,
      compositionOutputStorageKey,
      mediaArtifactId,
      finalizedArtifactId,
      promotedVaultAssetId: promoted.vaultAssetId,
      vaultAssetId: promoted.vaultAssetId,
      mediaFileId: promoted.vaultAssetId,
      previewAssetRef: promoted.vaultAssetId,
      storageKey: promoted.storageKey || compositionOutputStorageKey,
      tenantScope,
      mimeType: promoted.mimeType ?? input.mimeType,
      byteLength: input.composedBytes.length,
      referenceExists: true,
      referenceResolves: true,
      bytesExist: true,
      resolverResult: "promote_ok",
    });

    return {
      ok: true,
      mediaArtifactId,
      vaultAssetId: promoted.vaultAssetId,
      contentHash,
    };
  } catch (promoteErr) {
    logCdfAssetByteLifecycle({
      boundary: "persist_composed.promote_exception",
      executionId: input.executionId,
      compositionOutputRef: mediaArtifactId,
      compositionOutputStorageKey,
      mediaArtifactId,
      finalizedArtifactId,
      promotedVaultAssetId,
      mediaFileId: null,
      previewAssetRef: null,
      storageKey: compositionOutputStorageKey,
      tenantScope,
      mimeType: input.mimeType,
      byteLength: input.composedBytes.length,
      referenceExists: true,
      referenceResolves: false,
      bytesExist: true,
      resolverResult:
        promoteErr instanceof Error
          ? promoteErr.message.slice(0, 120)
          : "promote_exception",
    });
    return {
      ok: false,
      reason:
        promoteErr instanceof Error
          ? `composed_vault_promote_failed:${promoteErr.message.slice(0, 120)}`
          : "composed_vault_promote_failed",
    };
  }
}

export function resolveComposedVaultBytesForTests(
  vaultAssetId: string,
): { bytes: Buffer; mimeType: string } | undefined {
  ensureMaps();
  return g.__cdfVaultBytesMap?.get(vaultAssetId);
}
