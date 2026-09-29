/**
 * Phase 19 — Production Hardening / Rollout Readiness public surface.
 */

export {
  PRODUCTION_HARDENING_CONTRACT_VERSION,
  type PathClassification,
  type RolloutReadiness,
  type RolloutStage,
  type FeatureFlagState,
  type FlagMatrixCell,
  type ProductionPathEntry,
  type BypassCatalogEntry,
  type ServiceRolloutRow,
  type FailureContainmentExpectation,
  type ProductionConfigDoc,
} from "./types";

export {
  PRODUCTION_PATH_INVENTORY,
  listProductionPaths,
  getProductionPath,
} from "./path-inventory";

export {
  readFeatureFlagState,
  describeFlagMatrixCell,
  allFlagMatrixCells,
  PRODUCTION_FLAG_DEFAULTS,
} from "./flag-matrix";

export {
  classifyServiceRollout,
  listServiceRolloutClassifications,
  summarizeRolloutReadiness,
  recommendedStageForService,
} from "./service-rollout";

export {
  BYPASS_CATALOG,
  listBypassCatalog,
  listRolloutBlockers,
  assertNoOpenRolloutBlockers,
} from "./bypass-catalog";

export {
  STANDARD_FAILURE_CONTAINMENT,
  FAILURE_POINTS,
  containmentFor,
  assertNoAdvancementOnInvalidQa,
  assertRepairDoesNotValidateUnsupported,
  assertExactVersionPin,
  assertExactArtifactVersionMatch,
  assertTraceDetailsSafe,
  assertFlagsRemainDefaultOff,
  type FailurePoint,
} from "./failure-containment";

export {
  provePresentationNnPlusOneContinuity,
  assertClassAContinuityReady,
  assertClassDContinuityIncomplete,
  type NnPlusOneProofSummary,
} from "./continuity-proof";

export {
  ROLLOUT_POLICY_STAGES,
  getRolloutPolicy,
  resolveConfiguredRolloutStage,
  type RolloutPolicyStage,
} from "./rollout-policy";

export {
  CDF_CANONICAL_ROLLOUT_STAGE_ENV,
  CDF_CANONICAL_INTERNAL_ORG_ALLOWLIST_ENV,
  CDF_CANONICAL_INTERNAL_PROJECT_ALLOWLIST_ENV,
  CDF_CANONICAL_HTTP_OUTPUT_QA_ENV,
  CDF_CANONICAL_HTTP_REPAIR_ENV,
  CDF_CANONICAL_ROLLOUT_COMPAT_ENV,
  parseRolloutStageEnv,
  resolveCanonicalGenerationEligibility,
  isHttpOutputQaEnabled,
  isHttpRepairEnabled,
  isRolloutCompatEnabled,
  isClassARolloutService,
  STAGE_2_CLASS_A_SERVICES,
  PRODUCTION_ROLLOUT_CONTRACT,
  type CanonicalPathDecision,
  type CanonicalEligibilityInput,
  type CanonicalEligibilityDecision,
  type EligibilityDenyReason,
} from "./eligibility";

export {
  CANONICAL_INGRESS_AUDIT,
  listCanonicalIngressAudit,
  assertAllModelIngressesGated,
  type CanonicalIngressRow,
  type IngressEligibilityStatus,
} from "./ingress-audit";

export { emitCanonicalRolloutDecisionTrace } from "./rollout-observability";

export {
  maybeRunHttpCreateOutputQa,
  type HttpCreateQaSeamResult,
} from "./http-qa-seam";

export {
  STAGE_1_TO_2_GATES,
  listStage1To2Gates,
  type RolloutGate,
  type RolloutGateId,
} from "./rollout-gates";

export {
  verifyFlagOffRollback,
  type RollbackVerification,
} from "./rollback";

export { runProductionHardeningSecurityReview } from "./security-review";

export function getProductionHardeningContractVersion(): string {
  return "21.0.0";
}

export const PRODUCTION_HARDENING_PHASE20_CONTRACT_VERSION = "20.0.0" as const;
export const PRODUCTION_HARDENING_PHASE21_CONTRACT_VERSION = "21.0.0" as const;
