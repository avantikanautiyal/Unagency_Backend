/**
 * Priority 4.3 — Evaluation completeness from existing ModelPerformanceRecord fields.
 */

import type { ModelPerformanceRecord } from "../../contracts/model-performance-record";
import { isFairModelComparisonOutcome } from "../../contracts/benchmark-outcome";
import type { EvidenceEvaluationCoverageSummary } from "./evidence-readiness-contract";

const BLOCKED_OUTCOMES = new Set([
  "CONTRACT_FAILURE",
  "VALIDATION_UNAVAILABLE",
  "EXECUTION_CAPABILITY_UNAVAILABLE",
]);

export function assessRecordEvaluationCompleteness(record: ModelPerformanceRecord): {
  readonly hasEvaluationPlane: boolean;
  readonly hasArtifactEvaluator: boolean;
  readonly objectiveRatio: number;
  readonly heuristicOnly: boolean;
  readonly modelJudgedOnly: boolean;
  readonly evaluationFailed: boolean;
  readonly notAutomatedCount: number;
  readonly measuredCount: number;
} {
  const measured = record.measuredQualityDimensions?.length ?? 0;
  const unmeasured = record.unmeasuredQualityDimensions?.length ?? 0;
  const total = measured + unmeasured;
  const objectiveRatio = total > 0 ? measured / total : 0;

  const provenanceText = (record.provenance ?? [])
    .map((p) => `${p.field}=${p.value}`)
    .join(" ")
    .toLowerCase();
  const modelJudgedOnly =
    provenanceText.includes("model_judged") ||
    provenanceText.includes("independent.visual") ||
    (measured === 0 && provenanceText.includes("estimated"));

  const heuristicOnly =
    measured === 0 && unmeasured > 0 && !modelJudgedOnly;

  const evaluationFailed =
    BLOCKED_OUTCOMES.has(record.benchmarkOutcome) ||
    record.validationStatus === "FAIL" ||
    !isFairModelComparisonOutcome(record.benchmarkOutcome);

  return Object.freeze({
    hasEvaluationPlane: Boolean(record.evaluationPlaneVersion || record.evaluationPlaneId),
    hasArtifactEvaluator: Boolean(
      record.artifactEvaluatorVersion || record.artifactEvaluatorId,
    ),
    objectiveRatio,
    heuristicOnly,
    modelJudgedOnly,
    evaluationFailed,
    notAutomatedCount: unmeasured,
    measuredCount: measured,
  });
}

export function summarizeEvaluationCoverage(
  records: readonly ModelPerformanceRecord[],
): EvidenceEvaluationCoverageSummary {
  let recordsWithEvaluationPlane = 0;
  let recordsWithArtifactEvaluator = 0;
  let heuristicOnlyRecords = 0;
  let modelJudgedRecords = 0;
  let failedEvaluationRecords = 0;
  let notAutomatedDimensionCount = 0;
  let measuredDimensionCount = 0;
  let objectiveRatioSum = 0;

  for (const record of records) {
    const c = assessRecordEvaluationCompleteness(record);
    if (c.hasEvaluationPlane) recordsWithEvaluationPlane += 1;
    if (c.hasArtifactEvaluator) recordsWithArtifactEvaluator += 1;
    if (c.heuristicOnly) heuristicOnlyRecords += 1;
    if (c.modelJudgedOnly) modelJudgedRecords += 1;
    if (c.evaluationFailed) failedEvaluationRecords += 1;
    notAutomatedDimensionCount += c.notAutomatedCount;
    measuredDimensionCount += c.measuredCount;
    objectiveRatioSum += c.objectiveRatio;
  }

  const n = records.length;
  return Object.freeze({
    recordsWithEvaluationPlane,
    recordsWithArtifactEvaluator,
    objectiveMeasurementRatio: n > 0 ? objectiveRatioSum / n : 0,
    heuristicOnlyRecords,
    modelJudgedRecords,
    failedEvaluationRecords,
    notAutomatedDimensionCount,
    measuredDimensionCount,
  });
}
