/**
 * Step 10 — Shadow decision contract (observational only; never dispatches providers).
 */

import type { EvidenceTier } from "../evidence/evidence-collection-config";
import type { PerformanceFingerprint } from "../contracts/model-performance-record";

export type ShadowDecisionStatus =
  | "SHADOW_RECOMMENDATION"
  | "INSUFFICIENT_EVIDENCE"
  | "INCOMPARABLE"
  | "NO_BETTER_CANDIDATE"
  | "CAPABILITY_MISMATCH"
  | "OPERATIONAL_RISK";

export type ShadowCandidateRef = {
  readonly providerId: string;
  readonly modelId: string;
  readonly strategyId: string;
  readonly strategyVersion?: string;
  readonly knowledgeId?: string;
  readonly knowledgeVersion?: string;
  readonly knowledgeFingerprint?: string;
};

export type ShadowDecision = {
  readonly shadowDecisionId: string;
  readonly productionExecutionId: string;
  readonly requestId?: string;
  readonly status: ShadowDecisionStatus;
  readonly actual: ShadowCandidateRef;
  readonly recommended?: ShadowCandidateRef;
  readonly recommendationScope: string;
  readonly evidenceCount: number;
  readonly validComparisonSamples: number;
  readonly confidenceTier: PerformanceFingerprint["confidence"]["level"];
  readonly evidenceTier: EvidenceTier;
  readonly observedAdvantage?: number;
  readonly latencyImplication?: string;
  readonly costImplication?: string;
  readonly reliabilityImplication?: string;
  readonly compatibilityStatus: "COMPARABLE" | "INCOMPARABLE" | "UNKNOWN";
  readonly evaluationPlaneVersion?: string;
  readonly evaluatorVersion?: string;
  readonly recommendationReason: string;
  readonly limitations: readonly string[];
  readonly decisionTimestamp: string;
  readonly promotionReadiness: PromotionReadinessStatus;
};

export type PromotionReadinessStatus =
  | "NOT_READY"
  | "INSUFFICIENT_EVIDENCE"
  | "INCOMPATIBLE_EVIDENCE"
  | "RELIABILITY_RISK"
  | "COST_RISK"
  | "LATENCY_RISK"
  | "READY_FOR_REVIEW";

export type ShadowDecisionContext = {
  readonly productionExecutionId: string;
  readonly requestId?: string;
  readonly organizationId: string;
  readonly service: string;
  readonly subtype: string;
  readonly outputKind: string;
  readonly industry?: string;
  readonly capabilityId: string;
  readonly actual: ShadowCandidateRef;
  readonly actualQualityScore?: number;
  readonly candidatePool?: readonly ShadowCandidateRef[];
};

export type ShadowDecisionQuery = {
  readonly productionExecutionId?: string;
  readonly service?: string;
  readonly industry?: string;
  readonly status?: ShadowDecisionStatus;
  readonly sinceIso?: string;
  readonly limit?: number;
};
