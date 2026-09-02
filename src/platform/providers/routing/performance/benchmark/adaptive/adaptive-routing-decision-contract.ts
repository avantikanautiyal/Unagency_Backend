/**
 * Step 12 — Adaptive routing decision contract (deterministic, evidence-driven).
 */

import type { ShadowCandidateRef } from "../shadow/shadow-decision-contract";

export const ADAPTIVE_ROUTING_DECISION_VERSION = "1.0.0" as const;

export type AdaptiveRoutingDecisionKind = "USE_ADAPTIVE" | "USE_EXISTING" | "FALLBACK";

export type AdaptiveRoutingDecisionReason =
  | "APPROVED_CANDIDATE"
  | "ADAPTIVE_DISABLED"
  | "INSUFFICIENT_EVIDENCE"
  | "LOW_CONFIDENCE"
  | "INCOMPATIBLE_EVIDENCE"
  | "CAPABILITY_MISMATCH"
  | "RELIABILITY_RISK"
  | "COST_RISK"
  | "LATENCY_RISK"
  | "ROLLOUT_NOT_SELECTED"
  | "CANDIDATE_UNAVAILABLE"
  | "CANDIDATE_EXPIRED"
  | "INVALID_POLICY"
  | "SAFETY_GUARD"
  | "UNKNOWN";

export type AdaptiveRoutingScope = {
  readonly service: string;
  readonly subtype?: string;
  readonly industry?: string;
  readonly platform?: string;
  readonly format?: string;
  readonly complexity?: string;
};

export type AdaptiveRoutingEvidenceSnapshot = {
  readonly validComparisonSamples: number;
  readonly confidence: string;
  readonly observedAdvantage?: number;
  readonly qualityDifference?: number;
  readonly hardRequirementDifference?: number;
  readonly latencyDifference?: number;
  readonly costDifference?: number;
  readonly reliabilityDifference?: number;
};

export type AdaptiveRoutingProvenance = {
  readonly benchmarkVersion?: string;
  readonly contractVersion?: string;
  readonly evaluatorVersion?: string;
  readonly evaluationPlaneVersion?: string;
  readonly strategyVersion?: string;
  readonly knowledgeVersion?: string;
  readonly executionProfileVersion?: string;
  readonly promotionCandidateId?: string;
  readonly routingPolicyId?: string;
  readonly routingPolicyVersion?: string;
};

export type AdaptiveRoutingDecision = {
  readonly decisionId: string;
  readonly decisionVersion: typeof ADAPTIVE_ROUTING_DECISION_VERSION;
  readonly requestId: string;
  readonly executionId?: string;
  readonly timestamp: string;
  readonly scope: AdaptiveRoutingScope;
  readonly actual: ShadowCandidateRef;
  readonly adaptive?: ShadowCandidateRef;
  readonly decision: AdaptiveRoutingDecisionKind;
  readonly reason: AdaptiveRoutingDecisionReason;
  readonly evidence: AdaptiveRoutingEvidenceSnapshot;
  readonly provenance: AdaptiveRoutingProvenance;
  readonly rolloutBucket?: number;
  readonly rolloutPercentage?: number;
  readonly rolloutSelected?: boolean;
  readonly routingMode: "static" | "adaptive";
  readonly correlationId?: string;
  readonly telemetry?: AdaptiveRoutingTelemetry;
};

export type AdaptiveRoutingTelemetry = {
  readonly event:
    | "adaptive_considered"
    | "adaptive_selected"
    | "adaptive_rejected"
    | "capability_mismatch"
    | "insufficient_evidence"
    | "guardrail_failure"
    | "invalid_policy";
  readonly staticProviderId?: string;
  readonly staticModelId?: string;
  readonly selectedProviderId?: string;
  readonly selectedModelId?: string;
  readonly capabilityPass?: boolean;
  readonly capabilityReasons?: readonly string[];
};

export type AdaptiveRoutingDecisionContext = {
  readonly requestId: string;
  readonly executionId?: string;
  readonly organizationId: string;
  readonly capabilityId: string;
  readonly scope: AdaptiveRoutingScope;
  readonly actual: ShadowCandidateRef;
  readonly outputKind?: string;
  readonly contractVersion?: string;
};

export type AdaptiveRoutingDecisionQuery = {
  readonly requestId?: string;
  readonly executionId?: string;
  readonly service?: string;
  readonly decision?: AdaptiveRoutingDecisionKind;
  readonly sinceIso?: string;
  readonly limit?: number;
};

export type RoutingMode = "static" | "adaptive";

export type ProductionRoutingMetadata = {
  readonly routingMode: RoutingMode;
  readonly routingPolicyId?: string;
  readonly routingPolicyVersion?: string;
  readonly adaptiveDecisionId?: string;
  readonly adaptiveSelected?: boolean;
  readonly adaptiveExecutionSucceeded?: boolean;
  readonly adaptiveExecutionFailed?: boolean;
  readonly fallbackUsed?: boolean;
  readonly fallbackReason?: string;
  readonly initialAdaptiveProviderId?: string;
  readonly initialAdaptiveModelId?: string;
  readonly finalProviderId?: string;
  readonly finalModelId?: string;
  readonly correlationId?: string;
};
