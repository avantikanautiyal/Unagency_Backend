/**
 * Evidence/confidence model for benchmark aggregates.
 */

import type { PerformanceConfidence } from "../contracts/model-performance-record";

export type ConfidenceInput = {
  readonly sampleCount: number;
  readonly scoreVariance?: number;
  readonly recencyDays?: number;
  readonly coverageRatio?: number;
};

export function computePerformanceConfidence(input: ConfidenceInput): PerformanceConfidence {
  const { sampleCount } = input;

  if (sampleCount < 3) {
    return Object.freeze({
      level: "insufficient",
      sampleCount,
      scoreVariance: input.scoreVariance,
      recencyWeight: recencyWeight(input.recencyDays),
      reason: `Insufficient evidence (${sampleCount} samples; minimum 3 required)`,
    });
  }

  const variance = input.scoreVariance ?? 0;
  const recency = recencyWeight(input.recencyDays);
  const coverage = input.coverageRatio ?? 1;

  if (sampleCount >= 50 && variance < 100 && recency >= 0.7 && coverage >= 0.8) {
    return Object.freeze({
      level: "high",
      sampleCount,
      scoreVariance: variance,
      recencyWeight: recency,
      reason: `Strong evidence (${sampleCount} samples, low variance, recent)`,
    });
  }

  if (sampleCount >= 10 && variance < 400) {
    return Object.freeze({
      level: "medium",
      sampleCount,
      scoreVariance: variance,
      recencyWeight: recency,
      reason: `Moderate evidence (${sampleCount} samples)`,
    });
  }

  return Object.freeze({
    level: "low",
    sampleCount,
    scoreVariance: variance,
    recencyWeight: recency,
    reason: `Limited evidence (${sampleCount} samples, high variance or stale)`,
  });
}

function recencyWeight(recencyDays?: number): number {
  if (recencyDays === undefined) return 1;
  if (recencyDays <= 7) return 1;
  if (recencyDays <= 30) return 0.8;
  if (recencyDays <= 90) return 0.5;
  return 0.3;
}

export function scoreVariance(values: readonly number[]): number | undefined {
  if (values.length < 2) return undefined;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return variance;
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
