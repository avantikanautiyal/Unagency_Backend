/**
 * Step 8 — Configurable evidence tier thresholds and collection settings.
 */

import type { PerformanceConfidence } from "../contracts/model-performance-record";

export type EvidenceTier = "INSUFFICIENT" | "LOW" | "MODERATE" | "STRONG";

export type EvidenceTierThresholds = {
  readonly insufficientBelow: number;
  readonly lowMin: number;
  readonly moderateMin: number;
  readonly strongMin: number;
};

export const DEFAULT_EVIDENCE_TIER_THRESHOLDS: EvidenceTierThresholds = Object.freeze({
  insufficientBelow: 3,
  lowMin: 3,
  moderateMin: 6,
  strongMin: 11,
});

export type SpecializationThresholds = {
  readonly minSampleCount: number;
  readonly minConfidenceLevel: PerformanceConfidence["level"];
  readonly minPerformanceAdvantage: number;
  readonly minSignificanceDelta: number;
};

export const DEFAULT_SPECIALIZATION_THRESHOLDS: SpecializationThresholds = Object.freeze({
  minSampleCount: 3,
  minConfidenceLevel: "low",
  minPerformanceAdvantage: 3,
  minSignificanceDelta: 5,
});

export type EvidenceCollectionBudget = {
  readonly maxInvocations: number;
  readonly maxEstimatedCostUsd?: number | null;
  readonly maxConcurrentExecutions: number;
  readonly maxRepeats: number;
  readonly largeRunThreshold: number;
  readonly allowLargeRunOverride?: boolean;
  readonly requireDryRunConfirmation?: boolean;
};

export const DEFAULT_EVIDENCE_COLLECTION_BUDGET: EvidenceCollectionBudget = Object.freeze({
  maxInvocations: 50,
  maxEstimatedCostUsd: null,
  maxConcurrentExecutions: 2,
  maxRepeats: 10,
  largeRunThreshold: 20,
  allowLargeRunOverride: false,
  requireDryRunConfirmation: true,
});

export const STEP8_PILOT_BUDGET: EvidenceCollectionBudget = Object.freeze({
  maxInvocations: 24,
  maxEstimatedCostUsd: null,
  maxConcurrentExecutions: 2,
  maxRepeats: 2,
  largeRunThreshold: 24,
  allowLargeRunOverride: true,
  requireDryRunConfirmation: false,
});

export function resolveEvidenceTier(
  sampleCount: number,
  thresholds: EvidenceTierThresholds = DEFAULT_EVIDENCE_TIER_THRESHOLDS,
): EvidenceTier {
  if (sampleCount < thresholds.insufficientBelow) return "INSUFFICIENT";
  if (sampleCount < thresholds.moderateMin) return "LOW";
  if (sampleCount < thresholds.strongMin) return "MODERATE";
  return "STRONG";
}

export function confidenceLevelRank(level: PerformanceConfidence["level"]): number {
  switch (level) {
    case "high":
      return 4;
    case "medium":
      return 3;
    case "low":
      return 2;
    case "insufficient":
      return 1;
  }
}

export function meetsConfidenceThreshold(
  confidence: PerformanceConfidence,
  minLevel: PerformanceConfidence["level"],
): boolean {
  return confidenceLevelRank(confidence.level) >= confidenceLevelRank(minLevel);
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}
