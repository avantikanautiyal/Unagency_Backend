/**
 * Step 9 — Human-readable and machine-readable experiment reports.
 */

import type { ModelPerformanceRecord } from "../../contracts/model-performance-record";
import type { ExperimentMatrixPlan } from "../matrix/experiment-matrix";
import type { ExperimentBudgetPlan } from "../budget/experiment-budget";
import type { ExperimentStatus } from "../contracts/experiment-status";
import type { OptimizationRecommendation } from "../recommendations/optimization-recommendations";
import type { ModelComparisonResult } from "../../evidence/specialization-detector";
import { resolveEvidenceTier } from "../../evidence/evidence-collection-config";

export type ExperimentRunReport = {
  readonly experimentId: string;
  readonly experimentVersion: string;
  readonly status: ExperimentStatus;
  readonly plan: ExperimentMatrixPlan;
  readonly budget: ExperimentBudgetPlan;
  readonly records: readonly ModelPerformanceRecord[];
  readonly sampleCount: number;
  readonly successfulSamples: number;
  readonly failedSamples: number;
  readonly validComparisonSamples: number;
  readonly operationalFailures: number;
};

export type ExperimentComparisonReport = {
  readonly experimentId: string;
  readonly comparisonMode: string;
  readonly candidateA: string;
  readonly candidateB: string;
  readonly comparisons: readonly ModelComparisonResult[];
  readonly recommendation?: OptimizationRecommendation;
};

export function buildExperimentRunReport(input: {
  readonly experimentId: string;
  readonly experimentVersion: string;
  readonly status: ExperimentStatus;
  readonly plan: ExperimentMatrixPlan;
  readonly budget: ExperimentBudgetPlan;
  readonly records: readonly ModelPerformanceRecord[];
}): ExperimentRunReport {
  const validOutcomes = new Set(["MODEL_SUCCESS", "MODEL_QUALITY_FAILURE"]);
  const validComparisonSamples = input.records.filter(
    (r) => r.validForModelComparison && validOutcomes.has(r.benchmarkOutcome),
  ).length;
  const operationalFailures = input.records.filter(
    (r) => r.benchmarkOutcome === "PROVIDER_OPERATIONAL_FAILURE",
  ).length;
  const successfulSamples = input.records.filter((r) => r.benchmarkOutcome === "MODEL_SUCCESS").length;
  const failedSamples = input.records.length - successfulSamples;

  return Object.freeze({
    experimentId: input.experimentId,
    experimentVersion: input.experimentVersion,
    status: input.status,
    plan: input.plan,
    budget: input.budget,
    records: input.records,
    sampleCount: input.records.length,
    successfulSamples,
    failedSamples,
    validComparisonSamples,
    operationalFailures,
  });
}

export function formatExperimentRunReport(report: ExperimentRunReport): string {
  const first = report.records[0];
  const lines = [
    "=== Step 9 Experiment Report ===",
    `Experiment: ${report.experimentId} v${report.experimentVersion}`,
    `Status: ${report.status}`,
    "",
    "Configuration:",
    ...report.plan.summary.map((s) => `  ${s}`),
    "",
    "Budget:",
    `  Planned invocations: ${report.budget.plannedInvocations}`,
    `  Within budget: ${report.budget.withinBudget ? "YES" : "NO"}`,
    "",
    "Evidence:",
    `  Sample count: ${report.sampleCount}`,
    `  Valid comparison samples: ${report.validComparisonSamples}`,
    `  Operational failures: ${report.operationalFailures}`,
  ];

  if (first) {
    lines.push(
      "",
      "Sample record:",
      `  Benchmark: ${first.benchmarkId}`,
      `  Service: ${first.service}/${first.subtype}`,
      `  Industry: ${first.industry ?? "n/a"}`,
      `  Complexity: ${first.complexity}`,
      `  Model: ${first.modelId}`,
      `  Strategy: ${first.strategyId} v${first.strategyVersion}`,
      `  Knowledge: ${first.knowledgeId ?? first.knowledgeVersion ?? "n/a"}`,
      `  Outcome: ${first.benchmarkOutcome}`,
      `  Quality: ${first.qualityScore}`,
      `  Hard requirement performance: ${(first.hardRequirementPassRate * 100).toFixed(0)}%`,
      `  Latency: ${first.latencyMs}ms`,
      `  Cost available: ${first.costAvailable ? String(first.estimatedCost ?? "n/a") : "NO"}`,
    );
  }

  return lines.join("\n");
}

export function formatExperimentComparisonReport(report: ExperimentComparisonReport): string {
  const comp = report.comparisons[0];
  const sampleTotal =
    comp?.status === "COMPARABLE"
      ? (comp.modelAFingerprint?.validComparisonSamples ?? 0) +
        (comp.modelBFingerprint?.validComparisonSamples ?? 0)
      : 0;
  const tier = comp?.status === "COMPARABLE" ? resolveEvidenceTier(sampleTotal) : "INSUFFICIENT";

  return [
    "=== Step 9 Experiment Comparison ===",
    `Experiment: ${report.experimentId}`,
    `Mode: ${report.comparisonMode}`,
    "",
    "Candidate A:",
    `  ${report.candidateA}`,
    "Candidate B:",
    `  ${report.candidateB}`,
    "",
    ...(comp
      ? [
          `Comparison status: ${comp.status}`,
          ...(comp.status === "COMPARABLE"
            ? [
                `Observed quality delta: ${(comp.qualityDelta ?? 0) >= 0 ? "+" : ""}${(comp.qualityDelta ?? 0).toFixed(1)}`,
                `Evidence tier: ${tier}`,
                `Comparison compatibility: ${comp.compatibility.compatible ? "COMPARABLE" : "INCOMPARABLE"}`,
              ]
            : [`Reason: ${comp.reason ?? "n/a"}`]),
        ]
      : ["No comparison result"]),
    "",
    ...(report.recommendation
      ? [
          `Recommendation: ${report.recommendation.recommendationStatus}`,
          `Candidate: ${report.recommendation.candidateLabel}`,
          `Confidence: ${report.recommendation.confidence}`,
          `Valid samples: ${report.recommendation.validComparisonSamples}`,
          ...(report.recommendation.limitations.length
            ? [`Limitations: ${report.recommendation.limitations.join("; ")}`]
            : []),
        ]
      : []),
  ].join("\n");
}

export function experimentReportToJson(report: ExperimentRunReport): Record<string, unknown> {
  return Object.freeze({
    experimentId: report.experimentId,
    experimentVersion: report.experimentVersion,
    status: report.status,
    sampleCount: report.sampleCount,
    validComparisonSamples: report.validComparisonSamples,
    operationalFailures: report.operationalFailures,
    plan: {
      totalInvocations: report.plan.totalInvocations,
      executable: report.plan.executableCells.length,
      skipped: report.plan.skippedCells.length,
      comparisonMode: report.plan.comparisonMode,
    },
    budget: {
      plannedInvocations: report.budget.plannedInvocations,
      withinBudget: report.budget.withinBudget,
      estimatedCost: report.budget.estimatedCost,
    },
    recordIds: report.records.map((r) => r.performanceRecordId),
  });
}
