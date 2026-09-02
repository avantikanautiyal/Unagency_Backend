/**
 * Priority 4.3 — Configurable evidence freshness and readiness thresholds.
 */

import {
  DEFAULT_EVIDENCE_TIER_THRESHOLDS,
  type EvidenceTierThresholds,
} from "../evidence-collection-config";

export type EvidenceFreshnessThresholds = {
  /** Days after which evidence is classified AGING (still usable, reduced confidence). */
  readonly agingAfterDays: number;
  /** Days after which evidence is classified STALE for readiness. */
  readonly staleAfterDays: number;
};

export const DEFAULT_EVIDENCE_FRESHNESS_THRESHOLDS: EvidenceFreshnessThresholds = Object.freeze({
  agingAfterDays: 30,
  staleAfterDays: 90,
});

export type EvidenceReadinessThresholds = EvidenceTierThresholds & {
  readonly minRepeatsPerBenchmarkCell: number;
  readonly minComparableCandidates: number;
  readonly minObjectiveMeasurementRatio: number;
  readonly freshness: EvidenceFreshnessThresholds;
};

export const DEFAULT_EVIDENCE_READINESS_THRESHOLDS: EvidenceReadinessThresholds = Object.freeze({
  ...DEFAULT_EVIDENCE_TIER_THRESHOLDS,
  minRepeatsPerBenchmarkCell: 2,
  minComparableCandidates: 2,
  minObjectiveMeasurementRatio: 0.25,
  freshness: DEFAULT_EVIDENCE_FRESHNESS_THRESHOLDS,
});

export type FreshnessClassification = "FRESH" | "AGING" | "STALE" | "UNKNOWN";

export function classifyEvidenceFreshness(input: {
  readonly ageDays?: number;
  readonly thresholds?: EvidenceFreshnessThresholds;
}): FreshnessClassification {
  if (input.ageDays == null || Number.isNaN(input.ageDays)) return "UNKNOWN";
  const t = input.thresholds ?? DEFAULT_EVIDENCE_FRESHNESS_THRESHOLDS;
  if (input.ageDays >= t.staleAfterDays) return "STALE";
  if (input.ageDays >= t.agingAfterDays) return "AGING";
  return "FRESH";
}

export function ageDaysFromIso(recordedAt: string, nowMs: number): number {
  const ts = Date.parse(recordedAt);
  if (Number.isNaN(ts)) return Number.NaN;
  return Math.max(0, (nowMs - ts) / (1000 * 60 * 60 * 24));
}
