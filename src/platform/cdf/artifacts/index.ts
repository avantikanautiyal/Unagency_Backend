/**
 * CDF 2.0 M3A — Canonical Artifact Engine public API.
 */

export * from "./types";
export * from "./errors";
export * from "./ids";
export * from "./lifecycle";
export * from "./schema-registry";
export {
  resetCdfArtifactStoreForTests,
  ensureCdfArtifactIndexes,
  ensureCdfArtifactBagLoaded,
  flushCdfArtifactBagToMongo,
  hydrateCdfArtifactBagFromSnapshot,
  getCdfArtifactBagSnapshotForTests,
} from "./store";
export { resetCdfArtifactIdsForTests } from "./ids";
export { resetArtifactSchemaRegistryForTests } from "./schema-registry";
export {
  createArtifact,
  createVersion,
  createVersionWithCasRetry,
  getArtifact,
  getArtifactVersion,
  getLatestArtifactVersion,
  getApprovedArtifactVersion,
  getSelectedArtifactVersion,
  listArtifactVersions,
  getArtifactLineage,
  markSelected,
  markApproved,
  markValidated,
  markRejected,
  supersede,
  archive,
  rejectMutableUpdate,
  getSupportedRepresentations,
  assertExecutionIsNotArtifactId,
  assertArtifactIdIsNotVaultAsset,
} from "./repository";
export { createArtifactFromCandidate } from "./candidate-boundary";
export {
  upsertSessionArtifactRef,
  applyArtifactEngineOnApprove,
  applyArtifactEngineOnSelect,
} from "./session-adapter";
export {
  bindGeneratedArtifactToSession,
  type BindGeneratedArtifactResult,
} from "./generated-bind";

export * from "./presentation";
export * from "./packaging";
export * from "./social-media";

import { resetCdfArtifactStoreForTests } from "./store";
import { resetCdfArtifactIdsForTests } from "./ids";
import { resetArtifactSchemaRegistryForTests } from "./schema-registry";
import { ensurePresentationSchemasRegistered } from "./presentation/register";
import { ensurePackagingSchemasRegistered } from "./packaging/register";
import { ensureSocialMediaSchemasRegistered } from "./social-media/register";

// Ensure presentation + packaging + social-media schemas are registered when the artifacts package loads.
ensurePresentationSchemasRegistered();
ensurePackagingSchemasRegistered();
ensureSocialMediaSchemasRegistered();

export function resetCdfArtifactEngineForTests(): void {
  resetCdfArtifactStoreForTests();
  resetCdfArtifactIdsForTests();
  resetArtifactSchemaRegistryForTests();
}
