/**
 * Priority 4.4 — Evidence gap analysis & controlled experiment planning (advisory only).
 */

import { buildEvidenceReadinessReport } from "../readiness/evidence-readiness-service";
import type {
  EvidenceGapAnalysisInput,
  EvidenceGapAnalysisReport,
  EvidenceGapObservation,
  EvidenceGap,
  ExperimentRecommendation,
} from "./evidence-gap-contract";
import { gapFromReadinessSlice, planExperimentForGap } from "./experiment-recommendation-planner";

export function analyzeEvidenceGapsAndPlanExperiments(
  input: EvidenceGapAnalysisInput,
): EvidenceGapAnalysisReport {
  const readiness = buildEvidenceReadinessReport({
    records: input.records,
    nowIso: input.nowIso,
    governanceBlockedScopeKeys: input.governanceBlockedScopeKeys,
  });

  const observations: EvidenceGapObservation[] = [];
  const gaps: EvidenceGap[] = [];
  const recommendations: ExperimentRecommendation[] = [];

  for (const slice of readiness.slices) {
    if (slice.readiness === "SUFFICIENT") {
      observations.push(
        Object.freeze({
          kind: "OBSERVATION",
          scope: slice.scope,
          readinessState: "SUFFICIENT",
          message: `Scope ${slice.scope.scopeKey} has sufficient controlled evidence — no experiment recommended`,
        }),
      );
      continue;
    }

    const gap = gapFromReadinessSlice(slice);
    if (!gap) continue;

    const recommendation = planExperimentForGap({
      gap,
      slice,
      eligibleModels: input.eligibleModels,
    });
    gaps.push(
      recommendation.action === "NO_ELIGIBLE_CANDIDATE" ? recommendation.gap : gap,
    );
    recommendations.push(recommendation);
  }

  const textReport = formatEvidenceGapAnalysisReport({
    readiness,
    observations,
    gaps,
    recommendations,
  });

  return Object.freeze({
    planeVersion: "p4.4.1",
    adaptiveRoutingActivated: false,
    readinessPlaneVersion: readiness.planeVersion,
    observations: Object.freeze(observations),
    gaps: Object.freeze(gaps),
    recommendations: Object.freeze(recommendations),
    textReport,
  });
}

export function formatEvidenceGapAnalysisReport(input: {
  readonly readiness: import("../readiness/evidence-readiness-contract").EvidenceReadinessReport;
  readonly observations: readonly EvidenceGapObservation[];
  readonly gaps: readonly EvidenceGap[];
  readonly recommendations: readonly ExperimentRecommendation[];
}): string {
  const lines = [
    "=== Evidence Gap Analysis & Experiment Planning (Priority 4.4) ===",
    "Adaptive routing activated: NO",
    `Readiness plane: ${input.readiness.planeVersion}`,
    `Overall readiness: ${input.readiness.overallReadiness}`,
    `Gaps identified: ${input.gaps.length}`,
    `Recommendations: ${input.recommendations.length}`,
    `Sufficient scopes (no action): ${input.observations.length}`,
    "",
  ];

  for (const obs of input.observations) {
    lines.push(`[OBSERVATION] ${obs.scope.scopeKey}: ${obs.message}`);
  }

  for (const rec of input.recommendations) {
    lines.push(`\n--- Gap: ${rec.gap.scope.scopeKey} ---`);
    lines.push(`Readiness: ${rec.gap.readinessState}`);
    lines.push(`Reason codes: ${rec.gap.reasonCodes.join(", ")}`);
    lines.push(`Action: ${rec.action}`);
    lines.push(`Strategy: ${rec.strategy}`);
    lines.push(`Candidates: ${rec.candidates.map((c) => c.modelId).join(", ") || "none"}`);
    lines.push(`Repeats: ${rec.repeats}`);
    lines.push(`Total invocations (planned): ${rec.totalInvocations}`);
    lines.push(`Executable: ${rec.executable}`);
    lines.push(`Governance: ${rec.governanceStatus}`);
    lines.push(`Expected improvement: ${rec.expectedReadinessImprovement}`);
    for (const r of rec.rationale) {
      lines.push(`  - ${r}`);
    }
  }

  lines.push("\nNOTE: Recommendations are advisory only — no execution occurs in P4.4.");

  return lines.join("\n");
}
