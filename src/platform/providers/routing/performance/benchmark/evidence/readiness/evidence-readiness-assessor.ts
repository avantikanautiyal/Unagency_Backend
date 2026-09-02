/**
 * Priority 4.3 — Deterministic evidence readiness assessment per scope slice.
 */

import type { ModelPerformanceRecord } from "../../contracts/model-performance-record";
import { checkComparisonCompatibility } from "../../intelligence/comparison-compatibility";
import { computePerformanceConfidence, scoreVariance } from "../../intelligence/confidence-model";
import {
  filterControlledRecords,
  filterObservationalProductionRecords,
  filterValidComparisonRecords,
  isControlledEvidenceRecord,
} from "../evidence-validity";
import { resolveEvidenceTier } from "../evidence-collection-config";
import {
  ageDaysFromIso,
  classifyEvidenceFreshness,
  DEFAULT_EVIDENCE_READINESS_THRESHOLDS,
  type EvidenceReadinessThresholds,
} from "./evidence-freshness-config";
import {
  assessRecordEvaluationCompleteness,
  summarizeEvaluationCoverage,
} from "./evaluation-completeness";
import { scopeFromRecord } from "./evidence-scope";
import type {
  EvidenceReadinessBlocker,
  EvidenceReadinessCandidate,
  EvidenceReadinessSliceReport,
  EvidenceReadinessState,
} from "./evidence-readiness-contract";

function modelKey(r: ModelPerformanceRecord): string {
  return `${r.providerId}:${r.modelId}`;
}

function repeatCoverageForModel(
  records: readonly ModelPerformanceRecord[],
  thresholds: EvidenceReadinessThresholds,
): number {
  const byBenchmark = new Map<string, Set<string>>();
  for (const r of records) {
    const key = r.benchmarkId;
    const execs = byBenchmark.get(key) ?? new Set<string>();
    execs.add(r.executionId);
    byBenchmark.set(key, execs);
  }
  if (byBenchmark.size === 0) return 0;
  const minRepeats = Math.min(
    ...[...byBenchmark.values()].map((s) => s.size),
  );
  return minRepeats >= thresholds.minRepeatsPerBenchmarkCell ? minRepeats : minRepeats;
}

function countComparableCandidates(valid: readonly ModelPerformanceRecord[]): number {
  const models = [...new Set(valid.map(modelKey))];
  if (models.length < 2) return models.length;

  let comparableModels = 0;
  for (const mk of models) {
    const modelRecords = valid.filter((r) => modelKey(r) === mk);
    const baseline = modelRecords[0];
    if (!baseline) continue;
    const others = valid.filter((r) => modelKey(r) !== mk);
    const hasComparablePeer = others.some(
      (o) => checkComparisonCompatibility(baseline, o).compatible,
    );
    if (hasComparablePeer) comparableModels += 1;
  }
  return comparableModels;
}

function hasIncomparablePair(valid: readonly ModelPerformanceRecord[]): boolean {
  for (let i = 0; i < valid.length; i += 1) {
    for (let j = i + 1; j < valid.length; j += 1) {
      const a = valid[i]!;
      const b = valid[j]!;
      if (modelKey(a) === modelKey(b)) continue;
      const compat = checkComparisonCompatibility(a, b);
      if (!compat.compatible) return true;
    }
  }
  return false;
}

function buildCandidates(
  controlled: readonly ModelPerformanceRecord[],
  valid: readonly ModelPerformanceRecord[],
  nowMs: number,
  thresholds: EvidenceReadinessThresholds,
): readonly EvidenceReadinessCandidate[] {
  const models = [...new Set(controlled.map(modelKey))];
  return Object.freeze(
    models.map((mk) => {
      const all = controlled.filter((r) => modelKey(r) === mk);
      const validForModel = valid.filter((r) => modelKey(r) === mk);
      const qualityScores = validForModel.map((r) => r.qualityScore);
      const ages = all.map((r) => ageDaysFromIso(r.recordedAt, nowMs)).filter((d) => !Number.isNaN(d));
      const recencyDays = ages.length > 0 ? Math.min(...ages) : undefined;
      const confidence = computePerformanceConfidence({
        sampleCount: validForModel.length,
        scoreVariance: scoreVariance(qualityScores),
        recencyDays,
        coverageRatio:
          all.length > 0 ? validForModel.length / all.length : 0,
      });
      const sortedDates = [...all.map((r) => r.recordedAt)].sort();
      return Object.freeze({
        providerId: all[0]!.providerId,
        modelId: all[0]!.modelId,
        controlledSampleCount: all.length,
        validComparisonSampleCount: validForModel.length,
        repeatCoverage: repeatCoverageForModel(all, thresholds),
        evidenceTier: resolveEvidenceTier(validForModel.length, thresholds),
        confidence,
        evaluationPlaneVersion: all[0]?.evaluationPlaneVersion,
        newestRecordedAt: sortedDates[sortedDates.length - 1],
        oldestRecordedAt: sortedDates[0],
        evidenceIds: Object.freeze(all.map((r) => r.performanceRecordId)),
      });
    }),
  );
}

function resolveReadinessState(input: {
  readonly blockers: readonly EvidenceReadinessBlocker[];
  readonly validCount: number;
  readonly comparableCandidates: number;
  readonly freshnessStatus: "FRESH" | "AGING" | "STALE" | "UNKNOWN";
  readonly evaluationCoverageRatio: number;
  readonly repeatCoverage: number;
  readonly thresholds: EvidenceReadinessThresholds;
}): EvidenceReadinessState {
  const codes = new Set(input.blockers.map((b) => b.code));

  if (
    codes.has("GOVERNANCE_BLOCKED") ||
    codes.has("EVALUATION_FAILURE") ||
    codes.has("INVALID_COMPARISON_PROVENANCE")
  ) {
    return "BLOCKED";
  }
  if (codes.has("INCOMPARABLE_CONFIGURATION") || codes.has("PROVENANCE_MISMATCH")) {
    return "INCOMPARABLE";
  }
  if (codes.has("STALE_EVIDENCE") && input.freshnessStatus === "STALE") {
    return "STALE";
  }
  if (
    codes.has("PRODUCTION_ONLY_EVIDENCE") ||
    codes.has("TOO_FEW_CONTROLLED_SAMPLES") ||
    codes.has("SINGLE_MODEL_ONLY") ||
    codes.has("NO_COMPARABLE_CANDIDATE") ||
    codes.has("INSUFFICIENT_REPEATS")
  ) {
    if (input.validCount > 0 && input.validCount < input.thresholds.insufficientBelow) {
      return "INSUFFICIENT";
    }
    if (codes.has("PRODUCTION_ONLY_EVIDENCE") && input.validCount === 0) {
      return "INSUFFICIENT";
    }
    if (
      codes.has("SINGLE_MODEL_ONLY") ||
      codes.has("NO_COMPARABLE_CANDIDATE") ||
      codes.has("TOO_FEW_CONTROLLED_SAMPLES") ||
      codes.has("INSUFFICIENT_REPEATS")
    ) {
      return input.validCount > 0 ? "PARTIAL" : "INSUFFICIENT";
    }
  }

  const tier = resolveEvidenceTier(input.validCount, input.thresholds);
  const repeatsOk = input.repeatCoverage >= input.thresholds.minRepeatsPerBenchmarkCell;
  const comparableOk = input.comparableCandidates >= input.thresholds.minComparableCandidates;
  const objectiveOk =
    input.evaluationCoverageRatio >= input.thresholds.minObjectiveMeasurementRatio;
  const freshOk = input.freshnessStatus !== "STALE";

  if (
    tier === "MODERATE" ||
    tier === "STRONG"
  ) {
    if (comparableOk && repeatsOk && objectiveOk && freshOk) return "SUFFICIENT";
    if (input.validCount >= input.thresholds.lowMin) return "PARTIAL";
  }

  if (tier === "LOW" && input.validCount >= input.thresholds.lowMin) {
    return "PARTIAL";
  }

  if (input.validCount === 0) return "INSUFFICIENT";
  if (input.validCount < input.thresholds.insufficientBelow) return "INSUFFICIENT";
  return "PARTIAL";
}

export function assessEvidenceReadinessSlice(input: {
  readonly scopeRecords: readonly ModelPerformanceRecord[];
  readonly governanceBlocked?: boolean;
  readonly nowMs: number;
  readonly thresholds?: EvidenceReadinessThresholds;
}): EvidenceReadinessSliceReport {
  const thresholds = input.thresholds ?? DEFAULT_EVIDENCE_READINESS_THRESHOLDS;
  const scope = scopeFromRecord(input.scopeRecords[0]!);
  const production = filterObservationalProductionRecords(input.scopeRecords);
  const controlled = filterControlledRecords(input.scopeRecords);
  const valid = filterValidComparisonRecords(input.scopeRecords);
  const blockers: EvidenceReadinessBlocker[] = [];

  if (input.governanceBlocked) {
    blockers.push(
      Object.freeze({
        code: "GOVERNANCE_BLOCKED",
        message: `Scope ${scope.scopeKey} is blocked by governance policy`,
      }),
    );
  }

  if (controlled.length === 0 && production.length > 0) {
    blockers.push(
      Object.freeze({
        code: "PRODUCTION_ONLY_EVIDENCE",
        message:
          "Only production observational evidence present — excluded from controlled comparison readiness",
        evidenceIds: Object.freeze(production.map((r) => r.performanceRecordId)),
      }),
    );
  }

  for (const r of input.scopeRecords) {
    if (isControlledEvidenceRecord(r) && r.validForModelComparison === false) {
      blockers.push(
        Object.freeze({
          code: "INVALID_COMPARISON_PROVENANCE",
          message: `Controlled record ${r.performanceRecordId} is not valid for model comparison`,
          evidenceIds: Object.freeze([r.performanceRecordId]),
        }),
      );
    }
    const evalC = assessRecordEvaluationCompleteness(r);
    if (evalC.evaluationFailed && isControlledEvidenceRecord(r)) {
      blockers.push(
        Object.freeze({
          code: "EVALUATION_FAILURE",
          message: `Evaluation/contract failure on ${r.performanceRecordId}: ${r.benchmarkOutcome}`,
          evidenceIds: Object.freeze([r.performanceRecordId]),
        }),
      );
    }
  }

  const evaluationCoverage = summarizeEvaluationCoverage(valid.length > 0 ? valid : controlled);
  if (
    evaluationCoverage.heuristicOnlyRecords > 0 &&
    evaluationCoverage.measuredDimensionCount === 0 &&
    controlled.length > 0
  ) {
    blockers.push(
      Object.freeze({
        code: "HEURISTIC_ONLY_EVALUATION",
        message: "Evidence slice relies on heuristic evaluation without objective measurements",
      }),
    );
  }
  if (evaluationCoverage.modelJudgedRecords > 0 && evaluationCoverage.measuredDimensionCount === 0) {
    blockers.push(
      Object.freeze({
        code: "MODEL_JUDGED_ONLY",
        message: "Evidence slice relies on model-judged evaluation without objective measurements",
      }),
    );
  }
  if (controlled.length > 0 && evaluationCoverage.recordsWithEvaluationPlane === 0) {
    blockers.push(
      Object.freeze({
        code: "EVALUATION_INCOMPLETE",
        message: "Controlled evidence lacks Evaluation Plane provenance",
      }),
    );
  }

  const planeVersions = new Set(
    valid.map((r) => r.evaluationPlaneVersion).filter(Boolean) as string[],
  );
  if (planeVersions.size > 1) {
    blockers.push(
      Object.freeze({
        code: "PROVENANCE_MISMATCH",
        message: `Multiple evaluation plane versions in comparable set: ${[...planeVersions].join(", ")}`,
      }),
    );
  }

  if (valid.length > 0 && hasIncomparablePair(valid)) {
    blockers.push(
      Object.freeze({
        code: "INCOMPARABLE_CONFIGURATION",
        message: "Comparable records differ materially on benchmark/strategy/evaluator configuration",
      }),
    );
  }

  const comparableCandidates = countComparableCandidates(valid);
  const modelCount = new Set(valid.map(modelKey)).size;
  if (valid.length > 0 && modelCount < thresholds.minComparableCandidates) {
    blockers.push(
      Object.freeze({
        code: "SINGLE_MODEL_ONLY",
        message: `Only ${modelCount} model(s) with valid comparison evidence — need ${thresholds.minComparableCandidates} for comparison readiness`,
      }),
    );
  } else if (valid.length > 0 && comparableCandidates < thresholds.minComparableCandidates) {
    blockers.push(
      Object.freeze({
        code: "NO_COMPARABLE_CANDIDATE",
        message: "No pairwise comparable competing model evidence in this scope",
      }),
    );
  }

  if (valid.length < thresholds.insufficientBelow) {
    blockers.push(
      Object.freeze({
        code: "TOO_FEW_CONTROLLED_SAMPLES",
        message: `${valid.length} valid controlled sample(s); minimum ${thresholds.insufficientBelow} required`,
      }),
    );
  }

  const repeatCoverage = valid.length > 0
    ? Math.min(...[...new Set(valid.map(modelKey))].map((mk) =>
        repeatCoverageForModel(
          valid.filter((r) => modelKey(r) === mk),
          thresholds,
        ),
      ))
    : 0;

  if (valid.length > 0 && repeatCoverage < thresholds.minRepeatsPerBenchmarkCell) {
    blockers.push(
      Object.freeze({
        code: "INSUFFICIENT_REPEATS",
        message: `Repeat coverage ${repeatCoverage} below minimum ${thresholds.minRepeatsPerBenchmarkCell}`,
      }),
    );
  }

  const ages = valid.map((r) => ageDaysFromIso(r.recordedAt, input.nowMs)).filter((d) => !Number.isNaN(d));
  const freshnessDays = ages.length > 0 ? Math.max(...ages) : undefined;
  const freshnessStatus = classifyEvidenceFreshness({
    ageDays: freshnessDays,
    thresholds: thresholds.freshness,
  });
  if (freshnessStatus === "STALE" && valid.length > 0) {
    blockers.push(
      Object.freeze({
        code: "STALE_EVIDENCE",
        message: `Newest valid evidence is ${Math.round(freshnessDays ?? 0)} days old (stale threshold ${thresholds.freshness.staleAfterDays}d)`,
      }),
    );
  }

  const candidates = buildCandidates(controlled, valid, input.nowMs, thresholds);
  const qualityScores = valid.map((r) => r.qualityScore);
  const confidence = computePerformanceConfidence({
    sampleCount: valid.length,
    scoreVariance: scoreVariance(qualityScores),
    recencyDays: freshnessDays,
    coverageRatio: controlled.length > 0 ? valid.length / controlled.length : 0,
  });

  const readiness = resolveReadinessState({
    blockers,
    validCount: valid.length,
    comparableCandidates,
    freshnessStatus,
    evaluationCoverageRatio: evaluationCoverage.objectiveMeasurementRatio,
    repeatCoverage,
    thresholds,
  });

  return Object.freeze({
    scope,
    readiness,
    controlledEvidenceCount: controlled.length,
    productionEvidenceCountExcluded: production.length,
    validComparisonSampleCount: valid.length,
    comparableCandidateCount: comparableCandidates,
    repeatCoverage,
    evaluationCoverage,
    evidenceTier: resolveEvidenceTier(valid.length, thresholds),
    confidence,
    freshnessDays,
    freshnessStatus,
    candidates,
    blockers: Object.freeze(blockers),
    evidenceIds: Object.freeze(input.scopeRecords.map((r) => r.performanceRecordId)),
    adaptiveRoutingEligible: false,
  });
}
