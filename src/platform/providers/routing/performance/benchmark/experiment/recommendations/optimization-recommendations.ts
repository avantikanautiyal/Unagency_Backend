/**
 * Step 9 — Evidence-based optimization recommendations (never modifies production routing).
 */

import type { PerformanceFingerprint } from "../../contracts/model-performance-record";
import { resolveEvidenceTier, type EvidenceTier } from "../../evidence/evidence-collection-config";

export type RecommendationStatus = "INSUFFICIENT_EVIDENCE" | "RECOMMENDATION";

export type OptimizationRecommendation = {
  readonly recommendationStatus: RecommendationStatus;
  readonly scope: string;
  readonly candidateLabel: string;
  readonly candidate: Readonly<Record<string, string | undefined>>;
  readonly evidenceCount: number;
  readonly validComparisonSamples: number;
  readonly confidence: PerformanceFingerprint["confidence"]["level"];
  readonly evidenceTier: EvidenceTier;
  readonly observedAdvantage?: number;
  readonly conditions: readonly string[];
  readonly versions: Readonly<Record<string, string | undefined>>;
  readonly limitations: readonly string[];
  readonly comparisonCompatibility: "COMPARABLE" | "INCOMPARABLE";
};

export function buildOptimizationRecommendation(input: {
  readonly scope: string;
  readonly candidateLabel: string;
  readonly candidate: Readonly<Record<string, string | undefined>>;
  readonly fingerprint?: PerformanceFingerprint;
  readonly observedAdvantage?: number;
  readonly minValidSamples?: number;
  readonly comparisonCompatibility?: "COMPARABLE" | "INCOMPARABLE";
  readonly conditions?: readonly string[];
  readonly versions?: Readonly<Record<string, string | undefined>>;
  readonly limitations?: readonly string[];
}): OptimizationRecommendation {
  const minValid = input.minValidSamples ?? 2;
  const fp = input.fingerprint;
  const validSamples = fp?.validComparisonSamples ?? 0;
  const evidenceCount = fp?.sampleCount ?? 0;
  const tier = resolveEvidenceTier(validSamples);
  const confidence = fp?.confidence.level ?? "insufficient";

  const insufficient =
    !fp ||
    validSamples < minValid ||
    confidence === "insufficient" ||
    tier === "INSUFFICIENT" ||
    input.comparisonCompatibility === "INCOMPARABLE";

  const limitations = [
    ...(input.limitations ?? []),
    ...(insufficient ? ["Insufficient controlled comparison evidence"] : []),
    "Observed performance difference under controlled conditions — not a causal claim.",
  ];

  return Object.freeze({
    recommendationStatus: insufficient ? "INSUFFICIENT_EVIDENCE" : "RECOMMENDATION",
    scope: input.scope,
    candidateLabel: input.candidateLabel,
    candidate: input.candidate,
    evidenceCount,
    validComparisonSamples: validSamples,
    confidence,
    evidenceTier: tier,
    observedAdvantage: input.observedAdvantage,
    conditions: Object.freeze(input.conditions ?? []),
    versions: Object.freeze(input.versions ?? {}),
    limitations: Object.freeze([...new Set(limitations)]),
    comparisonCompatibility: input.comparisonCompatibility ?? "COMPARABLE",
  });
}

export function selectBestSupportedCandidate(
  candidates: readonly {
    readonly label: string;
    readonly candidate: Readonly<Record<string, string | undefined>>;
    readonly fingerprint?: PerformanceFingerprint;
  }[],
  input?: { readonly minValidSamples?: number },
): OptimizationRecommendation {
  const minValid = input?.minValidSamples ?? 2;
  const ranked = [...candidates]
    .filter((c) => (c.fingerprint?.validComparisonSamples ?? 0) >= minValid)
    .sort(
      (a, b) =>
        (b.fingerprint?.qualityScoreMean ?? 0) - (a.fingerprint?.qualityScoreMean ?? 0),
    );

  if (ranked.length === 0) {
    const first = candidates[0];
    return buildOptimizationRecommendation({
      scope: "combined",
      candidateLabel: first?.label ?? "none",
      candidate: first?.candidate ?? {},
      fingerprint: first?.fingerprint,
      limitations: ["No candidate met minimum valid comparison samples"],
    });
  }

  const best = ranked[0]!;
  const runnerUp = ranked[1];
  return buildOptimizationRecommendation({
    scope: "combined",
    candidateLabel: best.label,
    candidate: best.candidate,
    fingerprint: best.fingerprint,
    observedAdvantage:
      runnerUp != null
        ? (best.fingerprint!.qualityScoreMean - runnerUp.fingerprint!.qualityScoreMean)
        : undefined,
    conditions: Object.freeze([
      "Best-supported candidate by mean quality score under fair comparison filters",
    ]),
  });
}
