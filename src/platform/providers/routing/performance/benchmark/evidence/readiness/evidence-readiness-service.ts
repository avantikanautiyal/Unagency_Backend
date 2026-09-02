/**
 * Priority 4.3 — Evidence quality & coverage control service.
 * Advisory readiness layer — does NOT activate adaptive routing.
 */

import type {
  EvidenceReadinessInput,
  EvidenceReadinessReport,
  EvidenceReadinessState,
} from "./evidence-readiness-contract";
import { groupRecordsByEvidenceScope } from "./evidence-scope";
import { assessEvidenceReadinessSlice } from "./evidence-readiness-assessor";
import {
  filterControlledRecords,
  filterObservationalProductionRecords,
} from "../evidence-validity";

const READINESS_RANK: Record<EvidenceReadinessState, number> = Object.freeze({
  BLOCKED: 0,
  INCOMPARABLE: 1,
  STALE: 2,
  INSUFFICIENT: 3,
  PARTIAL: 4,
  SUFFICIENT: 5,
});

function worstReadiness(states: readonly EvidenceReadinessState[]): EvidenceReadinessState {
  if (states.length === 0) return "INSUFFICIENT";
  return states.reduce((worst, s) =>
    READINESS_RANK[s] < READINESS_RANK[worst] ? s : worst,
  );
}

export function buildEvidenceReadinessReport(input: EvidenceReadinessInput): EvidenceReadinessReport {
  const nowIso = input.nowIso ?? (() => new Date().toISOString());
  const nowMs = Date.parse(nowIso());
  const blocked = new Set(input.governanceBlockedScopeKeys ?? []);

  const groups = groupRecordsByEvidenceScope(input.records);
  const slices = [...groups.entries()].map(([scopeKey, scopeRecords]) =>
    assessEvidenceReadinessSlice({
      scopeRecords,
      governanceBlocked: blocked.has(scopeKey),
      nowMs,
    }),
  );

  const productionExcluded = filterObservationalProductionRecords(input.records);
  const controlled = filterControlledRecords(input.records);
  const overallReadiness = worstReadiness(slices.map((s) => s.readiness));
  const allBlockers = slices.flatMap((s) => s.blockers);

  const textReport = formatEvidenceReadinessReport({
    overallReadiness,
    slices,
    totalRecords: input.records.length,
    controlledRecordCount: controlled.length,
    productionRecordCountExcluded: productionExcluded.length,
  });

  return Object.freeze({
    planeVersion: "p4.3.1",
    adaptiveRoutingActivated: false,
    overallReadiness,
    totalRecords: input.records.length,
    controlledRecordCount: controlled.length,
    productionRecordCountExcluded: productionExcluded.length,
    slices: Object.freeze(slices),
    blockers: Object.freeze(allBlockers),
    textReport,
  });
}

export function formatEvidenceReadinessReport(input: {
  readonly overallReadiness: EvidenceReadinessState;
  readonly slices: readonly import("./evidence-readiness-contract").EvidenceReadinessSliceReport[];
  readonly totalRecords: number;
  readonly controlledRecordCount: number;
  readonly productionRecordCountExcluded: number;
}): string {
  const lines = [
    "=== Evidence Quality & Coverage Readiness (Priority 4.3) ===",
    `Overall readiness: ${input.overallReadiness}`,
    "Adaptive routing activated: NO",
    `Total records: ${input.totalRecords}`,
    `Controlled records: ${input.controlledRecordCount}`,
    `Production observational excluded: ${input.productionRecordCountExcluded}`,
    "",
    "Per-scope slices:",
  ];

  for (const slice of input.slices) {
    lines.push(`\n--- ${slice.scope.scopeKey} ---`);
    lines.push(`Readiness: ${slice.readiness}`);
    lines.push(`Valid comparison samples: ${slice.validComparisonSampleCount}`);
    lines.push(`Comparable candidates: ${slice.comparableCandidateCount}`);
    lines.push(`Evidence tier: ${slice.evidenceTier}`);
    lines.push(`Confidence: ${slice.confidence.level}`);
    lines.push(`Freshness: ${slice.freshnessStatus}${slice.freshnessDays != null ? ` (${Math.round(slice.freshnessDays)}d)` : ""}`);
    lines.push(
      `Evaluation coverage: objectiveRatio=${slice.evaluationCoverage.objectiveMeasurementRatio.toFixed(2)} ` +
        `measuredDims=${slice.evaluationCoverage.measuredDimensionCount} ` +
        `notAutomatedDims=${slice.evaluationCoverage.notAutomatedDimensionCount}`,
    );
    if (slice.blockers.length > 0) {
      lines.push("Blockers:");
      for (const b of slice.blockers) {
        lines.push(`  - [${b.code}] ${b.message}`);
      }
    }
    for (const c of slice.candidates) {
      lines.push(
        `  ${c.modelId}: controlled=${c.controlledSampleCount} valid=${c.validComparisonSampleCount} ` +
          `repeats=${c.repeatCoverage} tier=${c.evidenceTier}`,
      );
    }
  }

  lines.push("\nNOTE: Readiness is advisory only — does NOT activate adaptive routing or auto-promotion.");

  return lines.join("\n");
}
