/**
 * Exact ArtifactVersion → Vault bytes resolution (shared handoff primitive).
 *
 * Used by:
 * - generation-continuation visual prepass
 * - generic upstream visual artifact handoff (IMAGE→VIDEO, IMAGE→IMAGE, …)
 *
 * Never resolves "latest". Never invents media. Tenant-scoped Vault only.
 */

import type { ResolvedArtifactReference } from "../../collaboration/conversational-task-intelligence/artifact-reference-bridge";

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

function bytesToDataUrl(bytes: Buffer | Uint8Array, mimeType: string): string {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return `data:${mimeType};base64,${buf.toString("base64")}`;
}

/**
 * Extract durable Vault ObjectId from canonical artifact payload.
 * Prefers root previewAssetRef; then first candidate/option with a vault id.
 */
export function extractVaultAssetIdFromArtifactData(
  data: unknown,
): string | undefined {
  const root = asRecord(data);
  if (!root) return undefined;
  const preview = asRecord(root.previewAssetRef);
  if (typeof preview?.vaultAssetId === "string" && preview.vaultAssetId.trim()) {
    return preview.vaultAssetId.trim();
  }
  for (const key of ["candidates", "options", "images", "items", "frames"] as const) {
    const arr = root[key];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      const rec = asRecord(item);
      const p = asRecord(rec?.previewAssetRef);
      if (typeof p?.vaultAssetId === "string" && p.vaultAssetId.trim()) {
        return p.vaultAssetId.trim();
      }
    }
  }
  return undefined;
}

/** Artifact types that carry provider-usable visual media via Vault. */
export function isVisualMediaArtifactType(artifactType: string | undefined): boolean {
  const t = (artifactType ?? "").trim().toLowerCase();
  return (
    t === "image" ||
    t === "image_set" ||
    t === "video" ||
    t === "logo" ||
    t === "pack" ||
    t === "hybrid"
  );
}

export function downstreamRequiresVisualMediaInput(
  generationModality: string | undefined,
): boolean {
  const m = (generationModality ?? "").trim().toLowerCase();
  return m === "image" || m === "video" || m === "hybrid";
}

/**
 * Resolve exact cdfart_* @ version → Vault bytes → provider-usable data URL.
 */
export async function resolveCanonicalArtifactVisualBytes(input: {
  readonly artifactId: string;
  readonly artifactVersion: number;
  readonly organizationId: string;
  readonly projectId?: string;
}): Promise<
  | {
      ok: true;
      resolved: ResolvedArtifactReference;
      vaultAssetId: string;
      contentHash?: string;
      artifactKey?: string;
      artifactType?: string;
    }
  | { ok: false; reason: string }
> {
  try {
    const { getArtifactVersion, isCdfCanonicalArtifactId } = await import(
      "../artifacts"
    );
    if (!isCdfCanonicalArtifactId(input.artifactId)) {
      return { ok: false, reason: "not_canonical_artifact_id" };
    }
    if (
      input.artifactVersion == null ||
      !Number.isInteger(input.artifactVersion) ||
      input.artifactVersion < 1
    ) {
      return { ok: false, reason: "invalid_artifact_version" };
    }
    const version = getArtifactVersion(
      input.artifactId,
      input.artifactVersion,
      {
        organizationId: input.organizationId,
        projectId: input.projectId,
      },
    );
    if (!version?.data) {
      return { ok: false, reason: "artifact_version_data_missing" };
    }
    const vaultAssetId = extractVaultAssetIdFromArtifactData(version.data);
    if (!vaultAssetId) {
      return { ok: false, reason: "preview_vault_asset_missing" };
    }

    const { getDefaultVaultAssetResolver } = await import(
      "../rendering/default-vault-asset-resolver"
    );
    const resolver = getDefaultVaultAssetResolver();
    if (!resolver) {
      return { ok: false, reason: "vault_resolver_unavailable" };
    }
    const bytes = await resolver.resolve({
      vaultAssetId,
      organizationId: input.organizationId,
      projectId: input.projectId,
    });
    if (!bytes || bytes.byteLength === 0) {
      return { ok: false, reason: "vault_bytes_empty" };
    }

    const mimeType = "image/png";
    const { createHash } = await import("node:crypto");
    const contentHash = createHash("sha256").update(bytes).digest("hex");

    return {
      ok: true,
      vaultAssetId,
      contentHash,
      artifactKey: version.artifactKey,
      artifactType: version.artifactType,
      resolved: Object.freeze({
        artifactId: input.artifactId,
        organizationId: input.organizationId,
        mimeType,
        source: "artifact_store" as const,
        providerInput: Object.freeze({
          url: bytesToDataUrl(bytes, mimeType),
          mimeType,
          organizationId: input.organizationId,
          assetId: input.artifactId,
        }),
      }),
    };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "resolve_failed",
    };
  }
}
