/**
 * Step 10 — Shadow optimization (read-only)
 */

export {
  type ShadowDecisionStatus,
  type ShadowCandidateRef,
  type ShadowDecision,
  type PromotionReadinessStatus,
  type ShadowDecisionContext,
  type ShadowDecisionQuery,
} from "./shadow-decision-contract";

export {
  DEFAULT_PROMOTION_READINESS_THRESHOLDS,
  loadPromotionReadinessThresholds,
  type PromotionReadinessThresholds,
} from "./shadow-config";

export {
  assessPromotionReadiness,
  formatPromotionReadiness,
  type PromotionReadinessInput,
} from "./promotion-readiness";

export {
  InMemoryShadowDecisionStore,
  defaultShadowDecisionStore,
  type IShadowDecisionStore,
} from "./shadow-decision-store";

export {
  buildDefaultShadowCandidatePool,
  sameShadowCandidate,
} from "./shadow-candidate-catalog";

export {
  resolveShadowDecision,
  createShadowDecisionService,
  type ShadowDecisionServiceDeps,
} from "./shadow-decision-service";

export {
  logShadowSafetyGate,
  logShadowDecision,
  logShadowComparison,
  logProductionEvidenceFailure,
  logProductionEvidenceRecorded,
} from "./shadow-logger";
