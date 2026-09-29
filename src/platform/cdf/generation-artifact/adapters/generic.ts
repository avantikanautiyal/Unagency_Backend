/**
 * Contract-driven generic normalize — TEXT / STRUCTURED / IMAGE / VIDEO.
 *
 * Used when the artifact key is not a Class-A deep overlay
 * (presentation / packaging / social-media). Does not invent creative content.
 * Does not branch on serviceId / phaseId / provider / model.
 */

import type { CdfArtifactType } from "../../artifacts/types";
import { generationArtifactError } from "../errors";
import {
  asString,
  assertVaultAssetIds,
  isRecord,
  requireRecord,
  unwrapProviderEnvelope,
} from "../parse";
import { isVaultAssetObjectIdShape } from "../../artifacts/ids";

const MEDIA_TYPES = new Set<CdfArtifactType>([
  "image",
  "image_set",
  "video",
  "logo",
  "pack",
]);

function pickPreviewVaultId(
  root: Record<string, unknown>,
  vaultAssetIds: string[],
): string | undefined {
  if (isRecord(root.previewAssetRef)) {
    const id = asString(root.previewAssetRef.vaultAssetId);
    if (id && isVaultAssetObjectIdShape(id)) return id;
  }
  const direct = asString(root.vaultAssetId);
  if (direct && isVaultAssetObjectIdShape(direct)) return direct;
  for (const id of vaultAssetIds) {
    if (isVaultAssetObjectIdShape(id)) return id;
  }
  return undefined;
}

/**
 * Normalize provider/raw output into a soft-schema-compatible canonical object.
 * Artifact identity (key/type) comes from the phase contract target — never from prose.
 */
export function normalizeGenericCanonicalData(
  target: {
    readonly artifactKey: string;
    readonly artifactType: CdfArtifactType;
  },
  raw: unknown,
  opts?: {
    readonly vaultAssetIds?: string[];
  },
): Record<string, unknown> {
  const label = target.artifactKey;
  const vaultIds = assertVaultAssetIds(opts?.vaultAssetIds);

  if (MEDIA_TYPES.has(target.artifactType)) {
    const root = (() => {
      try {
        return unwrapProviderEnvelope(requireRecord(raw, label));
      } catch {
        // Media completion may arrive as a thin vault-only envelope.
        if (isRecord(raw)) return raw;
        return {} as Record<string, unknown>;
      }
    })();
    const previewId = pickPreviewVaultId(root, vaultIds);
    if (!previewId) {
      throw generationArtifactError(
        "ARTIFACT_ASSET_REFERENCE_INVALID",
        `${label}: canonical ${target.artifactType} requires previewAssetRef.vaultAssetId (24-hex Vault ObjectId)`,
      );
    }
    const out: Record<string, unknown> = {
      artifactKey: target.artifactKey,
      artifactType: target.artifactType,
      previewAssetRef: { vaultAssetId: previewId },
    };
    if (target.artifactType === "video") {
      const durationMs = root.durationMs ?? root.duration_ms;
      if (durationMs != null) out.durationMs = durationMs;
      const mime = asString(root.mimeType) ?? asString(root.mime);
      if (mime) out.mimeType = mime;
    }
    const title = asString(root.title) ?? asString(root.label);
    if (title) out.title = title;
    return out;
  }

  // TEXT / STRUCTURED / other document-like types
  const root = unwrapProviderEnvelope(requireRecord(raw, label));
  const out: Record<string, unknown> = {
    ...root,
    artifactKey: target.artifactKey,
    artifactType: target.artifactType,
  };
  // Never allow executionId to masquerade as artifact identity inside payload.
  if (
    out.executionId != null &&
    out.artifactId != null &&
    String(out.executionId) === String(out.artifactId)
  ) {
    delete out.artifactId;
  }
  return out;
}
