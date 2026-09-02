/**
 * Step 9 — Observational experiment logging (does not modify evaluation outcomes).
 */

import type { ModelPerformanceRecord } from "../../contracts/model-performance-record";
import type { ExperimentMatrixPlan, ExperimentMatrixCell } from "../matrix/experiment-matrix";
import type { ExperimentBudgetPlan } from "../budget/experiment-budget";
import type { ExperimentStatus } from "../contracts/experiment-status";
import type { OptimizationRecommendation } from "../recommendations/optimization-recommendations";

export function logExperimentStarted(input: {
  readonly experimentId: string;
  readonly status: ExperimentStatus;
  readonly plan: ExperimentMatrixPlan;
}): void {
  console.log(
    `[UNAGENCY-EXPERIMENT] started | experimentId=${input.experimentId} | status=${input.status} | invocations=${input.plan.totalInvocations}`,
  );
}

export function logExperimentConfiguration(plan: ExperimentMatrixPlan): void {
  console.log(`[UNAGENCY-EXPERIMENT] configuration`);
  for (const line of plan.summary) {
    console.log(`[UNAGENCY-EXPERIMENT]   ${line}`);
  }
}

export function logExperimentBudget(plan: ExperimentBudgetPlan): void {
  console.log(
    `[UNAGENCY-EXPERIMENT] budget | planned=${plan.plannedInvocations} | max=${plan.maxAllowed} | within=${plan.withinBudget}`,
  );
}

export function logExperimentCellStarted(cell: ExperimentMatrixCell): void {
  console.log(
    `[UNAGENCY-EXPERIMENT] cell | benchmark=${cell.benchmarkId} | model=${cell.model.modelId} | strategy=${cell.strategy.strategyId} | knowledge=${cell.knowledgeContext.knowledgeId}`,
  );
  console.log(
    `[UNAGENCY-STRATEGY] ${cell.strategy.strategyId} v${cell.strategy.version} | ${cell.strategy.strategyName}`,
  );
  console.log(
    `[UNAGENCY-KNOWLEDGE] ${cell.knowledgeContext.knowledgeId} v${cell.knowledgeContext.knowledgeVersion} | fp=${cell.knowledgeContext.contentFingerprint}`,
  );
}

export function logExperimentPerformanceRecord(record: ModelPerformanceRecord): void {
  console.log(
    `[UNAGENCY-EVALUATION] record | id=${record.performanceRecordId} | outcome=${record.benchmarkOutcome} | quality=${record.qualityScore} | valid=${record.validForModelComparison}`,
  );
  console.log(
    `[UNAGENCY-EXPERIMENT] provenance | strategy=${record.strategyId}@${record.strategyVersion} | knowledge=${record.knowledgeId ?? record.knowledgeVersion ?? "none"}`,
  );
}

export function logExperimentComparison(input: {
  readonly mode: string;
  readonly candidateA: string;
  readonly candidateB: string;
  readonly observedDifference?: number;
  readonly evidenceTier?: string;
  readonly status: string;
}): void {
  console.log(
    `[UNAGENCY-COMPARISON] ${input.mode} | ${input.candidateA} vs ${input.candidateB} | status=${input.status}` +
      (input.observedDifference != null ? ` | delta=${input.observedDifference.toFixed(2)}` : "") +
      (input.evidenceTier ? ` | evidence=${input.evidenceTier}` : ""),
  );
}

export function logOptimizationRecommendation(rec: OptimizationRecommendation): void {
  console.log(
    `[UNAGENCY-OPTIMIZATION] ${rec.recommendationStatus} | scope=${rec.scope} | candidate=${rec.candidateLabel}`,
  );
  if (rec.limitations.length) {
    console.log(`[UNAGENCY-OPTIMIZATION] limitations: ${rec.limitations.join("; ")}`);
  }
}

export function logExperimentCompleted(input: {
  readonly experimentId: string;
  readonly status: ExperimentStatus;
  readonly executed: number;
  readonly failed: number;
  readonly records: number;
}): void {
  console.log(
    `[UNAGENCY-EXPERIMENT] completed | experimentId=${input.experimentId} | status=${input.status} | executed=${input.executed} | failed=${input.failed} | records=${input.records}`,
  );
}
