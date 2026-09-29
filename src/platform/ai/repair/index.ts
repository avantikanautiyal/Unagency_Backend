/**
 * Phase 17 — Canonical Automatic Repair public surface.
 */

export {
  AUTOMATIC_REPAIR_CONTRACT_VERSION,
  CDF_CANONICAL_AUTOMATIC_REPAIR_ENV,
  DEFAULT_REPAIR_POLICY,
  DEFAULT_ELIGIBLE_REPAIR_CODES,
  NEVER_ELIGIBLE_REPAIR_CODES,
  isCanonicalAutomaticRepairEnvEnabled,
  type RepairStrategy,
  type RepairErrorCode,
  type CanonicalRepairPolicy,
  type CanonicalRepairRequest,
  type CanonicalRepairPlan,
  type CanonicalRepairAttemptRecord,
  type CanonicalRepairResult,
} from "./types";

export {
  mergeRepairPolicy,
  planCanonicalRepair,
  collectQaErrorCodes,
  isRepairEligibleCode,
  selectRepairStrategy,
} from "./eligibility";

export { attemptDeterministicNormalization } from "./normalize";

export {
  attemptCanonicalRepair,
  getAutomaticRepairContractVersion,
} from "./execute-repair";

export { emitRepairTrace } from "./trace";
