/**
 * Step 11 — Shadow Decision Validation + Promotion Governance
 */

export {
  type PromotionCandidateLifecycle,
  type PromotionCandidate,
  type PromotionCandidateQuery,
} from "./promotion-candidate-contract";

export {
  InMemoryPromotionCandidateStore,
  defaultPromotionCandidateStore,
  type IPromotionCandidateStore,
} from "./promotion-governance-store";

export {
  createPromotionGovernanceService,
  defaultPromotionGovernanceService,
  type PromotionGovernanceService,
} from "./promotion-governance-service";
