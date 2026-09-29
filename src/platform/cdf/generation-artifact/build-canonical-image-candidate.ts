/**
 * Contract-driven bridge: successful canonical image execution media
 * → structured ingest candidate + Vault previewAssetRef.
 *
 * Does NOT invent creative structure beyond the durable asset pin.
 * Adapters (Social / Packaging / …) specialize normalization from this seed.
 *
 * route_visual / legacy strategies must NOT use this path.
 */

import {
  isRouteVisualProductAction,
  resolveCdfPhaseExecutionContract,
  type CdfPhaseExecutionContract,
} from "../canonical";
import { isVaultAssetObjectIdShape } from "../artifacts/ids";

export type CanonicalImageIngestCandidate = {
  rawOutput: Record<string, unknown>;
  vaultAssetIds: string[];
  contract: CdfPhaseExecutionContract;
  vaultAssetId: string;
};

/**
 * True when the phase contract requires a canonical ArtifactVersion for an
 * image generation modality (framework rule — not service ifs).
 */
export function contractRequiresCanonicalImageIngest(
  metadata?: Record<string, unknown>,
): CdfPhaseExecutionContract | undefined {
  if (!metadata) return undefined;
  const productAction =
    typeof metadata.productAction === "string"
      ? metadata.productAction
      : undefined;
  if (isRouteVisualProductAction(productAction)) return undefined;

  const strategyStamp = metadata.cdfExecutionStrategy;
  if (
    typeof strategyStamp === "string" &&
    (strategyStamp === "route_visual" || strategyStamp === "legacy")
  ) {
    return undefined;
  }

  const serviceId =
    (typeof metadata.cdfServiceId === "string" && metadata.cdfServiceId.trim()) ||
    (typeof metadata.service === "string" && metadata.service.trim()) ||
    undefined;
  const phaseId =
    (typeof metadata.cdfPhaseId === "string" && metadata.cdfPhaseId.trim()) ||
    undefined;
  if (!serviceId || !phaseId) return undefined;

  const contract = resolveCdfPhaseExecutionContract({ serviceId, phaseId });
  if (!contract) return undefined;
  if (contract.executionStrategy !== "canonical") return undefined;
  // Media-first modalities — text envelopes are never authoritative here.
  if (
    contract.generationModality !== "image" &&
    contract.generationModality !== "video" &&
    contract.generationModality !== "hybrid"
  ) {
    return undefined;
  }
  if (!contract.artifactKey?.trim()) return undefined;
  return contract;
}

/**
 * Build a minimal structured candidate that adapters can canonicalize once a
 * Vault ObjectId exists. Missing vault → caller must fail closed (no ArtifactVersion).
 */
export function buildCanonicalImageIngestCandidate(input: {
  contract: CdfPhaseExecutionContract;
  vaultAssetId: string;
}): CanonicalImageIngestCandidate | { ok: false; reason: string } {
  const vaultAssetId = input.vaultAssetId.trim();
  if (!isVaultAssetObjectIdShape(vaultAssetId)) {
    return {
      ok: false,
      reason: "preview_asset_ref_must_be_vault_object_id",
    };
  }

  const artifactKey = input.contract.artifactKey;
  // Generic seed — adapters map keys they care about; extra keys are ignored.
  const previewAssetRef = {
    vaultAssetId,
    role: "creative_preview" as const,
  };
  const rawOutput: Record<string, unknown> = {
    creativeId: "creative_01",
    frontId: "package_surface_front",
    previewAssetRef,
    artifactKey,
  };

  // packaging.3d-direction requires candidates[] with visualIntent — a vault
  // preview alone is not structured 3D state. Seed one leaf-scoped candidate
  // so image fanout can canonicalize without inventing multi-route structure.
  if (artifactKey === "packaging.3d-direction") {
    rawOutput.candidates = [
      {
        id: "direction_01",
        name: "3D Direction",
        visualIntent:
          "Pack three-quarter product visualization for the selected design route",
        previewAssetRef: {
          vaultAssetId,
          role: "preview",
        },
      },
    ];
  }

  return {
    rawOutput,
    vaultAssetIds: [vaultAssetId],
    contract: input.contract,
    vaultAssetId,
  };
}
