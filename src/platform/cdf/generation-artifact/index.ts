/**
 * CDF 2.0 M3C — Generation → Canonical Artifact boundary.
 */

export * from "./types";
export * from "./errors";
export * from "./target-resolution";
export * from "./stable-ids";
export * from "./parse";
export * from "./stale";
export * from "./adapters";
export * from "./fixtures";
export * from "./path-audit";
export {
  ingestGenerationCompletion,
  normalizeToPresentationData,
  normalizeGenerationToCanonicalData,
} from "./service";
export {
  contractRequiresCanonicalImageIngest,
  buildCanonicalImageIngestCandidate,
} from "./build-canonical-image-candidate";
export { promoteExecutionMediaArtifactToVaultAsset, resolveExecutionMediaBlob } from "./promote-execution-media-to-vault";
export type { PromoteExecutionMediaToVaultResult } from "./promote-execution-media-to-vault";
export type { CanonicalImageIngestCandidate } from "./build-canonical-image-candidate";
