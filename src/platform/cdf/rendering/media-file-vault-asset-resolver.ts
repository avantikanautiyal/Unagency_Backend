/**
 * Production VaultAssetResolver — MediaFile (vault ObjectId) → IBlobStorage bytes.
 *
 * previewAssetRef.vaultAssetId is a MediaFile._id (24-hex). Bytes live under
 * MediaFile.storageKey in the authoritative blob store. This is the generic
 * materialization boundary for every service that pins a Vault ObjectId.
 */

import mongoose from "mongoose";
import MediaFile from "../../../models/mediaFile.model";
import type { IBlobStorage } from "../../persistence/interfaces";
import { parseStorageRefKey } from "../../media/blob/tenant-blob-key-builder";
import { isVaultAssetObjectIdShape } from "../artifacts/ids";
import type { VaultAssetResolver } from "./asset-resolver";
import { logCdfAssetByteLifecycle } from "../diagnostics/asset-byte-lifecycle-log";

export type MediaFileVaultAssetResolverOptions = {
  /** Prefer async-media / product blob backend. Required for durable resolve. */
  blobStorage: IBlobStorage;
  /** Optional alternate storage (e.g. product-asset singleton) tried if primary miss. */
  fallbackBlobStorage?: IBlobStorage;
};

function decodeBlobPayload(data: string): Uint8Array {
  if (data.startsWith("data:")) {
    const comma = data.indexOf(",");
    const b64 = comma >= 0 ? data.slice(comma + 1) : "";
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
  return new Uint8Array(Buffer.from(data, "base64"));
}

async function readBytesFromStorage(
  storage: IBlobStorage,
  storageKey: string,
): Promise<Uint8Array | undefined> {
  const got = await storage.get(storageKey);
  if (!got.ok || !got.value) return undefined;
  const payload = got.value.data;
  if (typeof payload !== "string" || !payload.length) return undefined;
  return decodeBlobPayload(payload);
}

function resolveStorageKey(doc: {
  storageKey?: string | null;
  url?: string | null;
}): string | undefined {
  if (typeof doc.storageKey === "string" && doc.storageKey.trim()) {
    return doc.storageKey.trim();
  }
  if (typeof doc.url === "string" && doc.url.trim()) {
    return parseStorageRefKey(doc.url.trim()) ?? undefined;
  }
  return undefined;
}

/**
 * Create a VaultAssetResolver backed by MediaFile metadata + IBlobStorage.
 * Does not invent assets, read execution media, or bypass ObjectId identity.
 */
export function createMediaFileVaultAssetResolver(
  options: MediaFileVaultAssetResolverOptions,
): VaultAssetResolver {
  const primary = options.blobStorage;
  const fallback = options.fallbackBlobStorage;

  return {
    async resolve(input) {
      const vaultAssetId = input.vaultAssetId?.trim() ?? "";
      const tenantScope = {
        organizationId: input.organizationId ?? null,
        projectId: input.projectId ?? null,
      };
      if (!isVaultAssetObjectIdShape(vaultAssetId)) {
        logCdfAssetByteLifecycle({
          boundary: "vault_resolver.invalid_id_shape",
          vaultAssetId,
          mediaFileId: vaultAssetId || null,
          tenantScope,
          referenceExists: Boolean(vaultAssetId),
          referenceResolves: false,
          bytesExist: false,
          resolverResult: "invalid_objectid_shape",
        });
        return undefined;
      }
      if (mongoose.connection.readyState !== 1) {
        logCdfAssetByteLifecycle({
          boundary: "vault_resolver.mongo_not_ready",
          vaultAssetId,
          mediaFileId: vaultAssetId,
          tenantScope,
          referenceExists: true,
          referenceResolves: false,
          bytesExist: false,
          resolverResult: "mongo_not_ready",
        });
        return undefined;
      }
      if (!mongoose.isValidObjectId(vaultAssetId)) {
        logCdfAssetByteLifecycle({
          boundary: "vault_resolver.invalid_objectid",
          vaultAssetId,
          mediaFileId: vaultAssetId,
          tenantScope,
          referenceExists: true,
          referenceResolves: false,
          bytesExist: false,
          resolverResult: "invalid_objectid",
        });
        return undefined;
      }

      const doc = await MediaFile.findById(vaultAssetId)
        .select(
          "storageKey url organizationId projectId status mimeType sizeBytes",
        )
        .lean()
        .exec();
      if (!doc) {
        logCdfAssetByteLifecycle({
          boundary: "vault_resolver.mediafile_missing",
          vaultAssetId,
          mediaFileId: vaultAssetId,
          tenantScope,
          referenceExists: true,
          referenceResolves: false,
          bytesExist: false,
          resolverResult: "mediafile_missing",
        });
        return undefined;
      }
      if (doc.status === "deleted") {
        logCdfAssetByteLifecycle({
          boundary: "vault_resolver.mediafile_deleted",
          vaultAssetId,
          mediaFileId: vaultAssetId,
          tenantScope,
          mimeType: doc.mimeType ?? null,
          referenceExists: true,
          referenceResolves: false,
          bytesExist: false,
          resolverResult: "mediafile_deleted",
        });
        return undefined;
      }

      if (
        input.organizationId &&
        doc.organizationId &&
        String(doc.organizationId) !== String(input.organizationId)
      ) {
        logCdfAssetByteLifecycle({
          boundary: "vault_resolver.tenant_org_mismatch",
          vaultAssetId,
          mediaFileId: vaultAssetId,
          tenantScope,
          mimeType: doc.mimeType ?? null,
          referenceExists: true,
          referenceResolves: false,
          bytesExist: false,
          resolverResult: "tenant_org_mismatch",
          extra: { docOrganizationId: String(doc.organizationId) },
        });
        return undefined;
      }
      if (
        input.projectId &&
        doc.projectId &&
        String(doc.projectId) !== String(input.projectId)
      ) {
        logCdfAssetByteLifecycle({
          boundary: "vault_resolver.tenant_project_mismatch",
          vaultAssetId,
          mediaFileId: vaultAssetId,
          tenantScope,
          mimeType: doc.mimeType ?? null,
          referenceExists: true,
          referenceResolves: false,
          bytesExist: false,
          resolverResult: "tenant_project_mismatch",
          extra: { docProjectId: String(doc.projectId) },
        });
        return undefined;
      }

      const storageKey = resolveStorageKey(doc);
      if (!storageKey) {
        logCdfAssetByteLifecycle({
          boundary: "vault_resolver.storage_key_missing",
          vaultAssetId,
          mediaFileId: vaultAssetId,
          tenantScope,
          mimeType: doc.mimeType ?? null,
          referenceExists: true,
          referenceResolves: false,
          bytesExist: false,
          resolverResult: "storage_key_missing",
        });
        return undefined;
      }

      const fromPrimary = await readBytesFromStorage(primary, storageKey);
      if (fromPrimary && fromPrimary.byteLength > 0) {
        logCdfAssetByteLifecycle({
          boundary: "vault_resolver.bytes_ok_primary",
          vaultAssetId,
          mediaFileId: vaultAssetId,
          storageKey,
          tenantScope,
          mimeType: doc.mimeType ?? null,
          byteLength: fromPrimary.byteLength,
          referenceExists: true,
          referenceResolves: true,
          bytesExist: true,
          resolverResult: "ok_primary",
        });
        return fromPrimary;
      }

      if (fallback && fallback !== primary) {
        const fromFallback = await readBytesFromStorage(fallback, storageKey);
        if (fromFallback && fromFallback.byteLength > 0) {
          logCdfAssetByteLifecycle({
            boundary: "vault_resolver.bytes_ok_fallback",
            vaultAssetId,
            mediaFileId: vaultAssetId,
            storageKey,
            tenantScope,
            mimeType: doc.mimeType ?? null,
            byteLength: fromFallback.byteLength,
            referenceExists: true,
            referenceResolves: true,
            bytesExist: true,
            resolverResult: "ok_fallback",
          });
          return fromFallback;
        }
      }

      logCdfAssetByteLifecycle({
        boundary: "vault_resolver.blob_bytes_missing",
        vaultAssetId,
        mediaFileId: vaultAssetId,
        storageKey,
        tenantScope,
        mimeType: doc.mimeType ?? null,
        byteLength: typeof doc.sizeBytes === "number" ? doc.sizeBytes : null,
        referenceExists: true,
        referenceResolves: true,
        bytesExist: false,
        resolverResult: "blob_bytes_missing",
      });
      return undefined;
    },
  };
}
