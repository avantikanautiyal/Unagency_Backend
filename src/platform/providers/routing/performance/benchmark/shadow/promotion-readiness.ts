/**
 * Step 10 — Deterministic promotion-readiness assessment (never activates routing).
 */

import type { OptimizationRecommendation } from "../experiment/recommendations/optimization-recommendations";
import type { PerformanceFingerprint } from "../contracts/model-performance-record";
import type { PromotionReadinessStatus, ShadowCandidateRef } from "./shadow-decision-contract";
import {
  DEFAULT_PROMOTION_READINESS_THRESHOLDS,
  meetsConfidenceThreshold,
  type PromotionReadinessThresholds,
} from "./shadow-config";

export type PromotionReadinessInput = {
  readonly recommendation: OptimizationRecommendation;
  readonly actual: ShadowCandidateRef;
  readonly recommended?: ShadowCandidateRef;
  readonly actualFingerprint?: PerformanceFingerprint;
  readonly recommendedFingerprint?: PerformanceFingerprint;
  readonly thresholds?: PromotionReadinessThresholds;
};

export function assessPromotionReadiness(input: PromotionReadinessInput): PromotionReadinessStatus {
  const thresholds = input.thresholds ?? DEFAULT_PROMOTION_READINESS_THRESHOLDS;
  const rec = input.recommendation;

  if (rec.recommendationStatus === "INSUFFICIENT_EVIDENCE") {
    return "INSUFFICIENT_EVIDENCE";
  }
  if (rec.comparisonCompatibility === "INCOMPARABLE") {
    return "INCOMPATIBLE_EVIDENCE";
  }
  if (rec.validComparisonSamples < thresholds.minValidSamples) {
    return "INSUFFICIENT_EVIDENCE";
  }
  if (!meetsConfidenceThreshold(rec.confidence, thresholds.minConfidenceLevel)) {
    return "INSUFFICIENT_EVIDENCE";
  }
  if ((rec.observedAdvantage ?? 0) < thresholds.minObservedAdvantage) {
    return "NOT_READY";
  }

  const recFp = input.recommendedFingerprint;
  if (
    recFp &&
    recFp.operationalFailureRate > thresholds.maxOperationalFailureRate
  ) {
    return "RELIABILITY_RISK";
  }

  const actualFp = input.actualFingerprint;
  if (actualFp && recFp) {
    if (
      actualFp.costMean != null &&
      recFp.costMean != null &&
      recFp.costMean > actualFp.costMean * thresholds.maxCostRegressionRatio
    ) {
      return "COST_RISK";
    }
    if (
      recFp.latencyMsMean > actualFp.latencyMsMean * thresholds.maxLatencyRegressionRatio
    ) {
      return "LATENCY_RISK";
    }
  }

  if (
    thresholds.requireEvaluatorVersionMatch &&
    rec.versions.evaluatorVersion &&
    actualFp?.evaluatorVersion &&
    rec.versions.evaluatorVersion !== actualFp.evaluatorVersion
  ) {
    return "INCOMPATIBLE_EVIDENCE";
  }

  return "READY_FOR_REVIEW";
}

export function formatPromotionReadiness(status: PromotionReadinessStatus): string {
  switch (status) {
    case "READY_FOR_REVIEW":
      return "Evidence may be sufficient for human review before any adaptive routing activation.";
    case "INSUFFICIENT_EVIDENCE":
      return "Insufficient controlled comparison evidence for promotion consideration.";
    case "INCOMPATIBLE_EVIDENCE":
      return "Evidence versions or compatibility prevent promotion consideration.";
    case "RELIABILITY_RISK":
      return "Recommended candidate shows elevated operational failure rate.";
    case "COST_RISK":
      return "Recommended candidate shows cost regression vs actual under historical evidence.";
    case "LATENCY_RISK":
      return "Recommended candidate shows latency regression vs actual under historical evidence.";
    default:
      return "Not ready for promotion review.";
  }
}
