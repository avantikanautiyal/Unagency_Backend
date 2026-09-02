/**
 * Step 9 — Fair comparison rules for controlled experiments.
 * Extends checkComparisonCompatibility — does not replace it.
 */

import { checkComparisonCompatibility } from "../../intelligence/comparison-compatibility";
import type { BenchmarkExecutionConditions } from "../../contracts/benchmark-case";
import type {
  ComparisonCompatibility,
  ModelPerformanceRecord,
} from "../../contracts/model-performance-record";

export type ExperimentComparisonMode = "model" | "strategy" | "knowledge" | "combination";

export type FairComparisonInput = {
  readonly mode: ExperimentComparisonMode;
  readonly a: ModelPerformanceRecord | BenchmarkExecutionConditions;
  readonly b: ModelPerformanceRecord | BenchmarkExecutionConditions;
};

export type FairComparisonResult = ComparisonCompatibility & {
  readonly mode: ExperimentComparisonMode;
  readonly comparable: boolean;
  readonly status: "COMPARABLE" | "INCOMPARABLE";
};

const HELD_EQUAL: Record<
  ExperimentComparisonMode,
  readonly (keyof ModelPerformanceRecord | keyof BenchmarkExecutionConditions)[]
> = Object.freeze({
  model: Object.freeze([
    "benchmarkId",
    "benchmarkVersion",
    "contractVersion",
    "strategyId",
    "strategyVersion",
    "knowledgeVersion",
    "knowledgeId",
    "knowledgeFingerprint",
    "evaluatorVersion",
    "executionProfileVersion",
    "artifactEvaluatorVersion",
    "evaluationPlaneVersion",
  ] as const),
  strategy: Object.freeze([
    "benchmarkId",
    "benchmarkVersion",
    "contractVersion",
    "providerId",
    "modelId",
    "modelVersion",
    "knowledgeVersion",
    "knowledgeId",
    "knowledgeFingerprint",
    "evaluatorVersion",
    "executionProfileVersion",
    "artifactEvaluatorVersion",
    "evaluationPlaneVersion",
  ] as const),
  knowledge: Object.freeze([
    "benchmarkId",
    "benchmarkVersion",
    "contractVersion",
    "providerId",
    "modelId",
    "modelVersion",
    "strategyId",
    "strategyVersion",
    "evaluatorVersion",
    "executionProfileVersion",
    "artifactEvaluatorVersion",
    "evaluationPlaneVersion",
  ] as const),
  combination: Object.freeze([
    "benchmarkId",
    "benchmarkVersion",
    "contractVersion",
    "evaluatorVersion",
    "executionProfileVersion",
    "artifactEvaluatorVersion",
    "evaluationPlaneVersion",
  ] as const),
});

function fieldValue(
  rec: ModelPerformanceRecord | BenchmarkExecutionConditions,
  key: string,
): string | undefined {
  if (!(key in rec)) return undefined;
  const val = (rec as Record<string, unknown>)[key];
  return val != null ? String(val) : undefined;
}

function varyingDimension(
  mode: ExperimentComparisonMode,
): readonly string[] {
  switch (mode) {
    case "model":
      return Object.freeze(["providerId", "modelId", "modelVersion"]);
    case "strategy":
      return Object.freeze(["strategyId", "strategyVersion"]);
    case "knowledge":
      return Object.freeze(["knowledgeId", "knowledgeVersion", "knowledgeFingerprint"]);
    case "combination":
      return Object.freeze([
        "providerId",
        "modelId",
        "strategyId",
        "strategyVersion",
        "knowledgeId",
        "knowledgeVersion",
      ]);
    default:
      return Object.freeze([]);
  }
}

export function checkFairComparison(input: FairComparisonInput): FairComparisonResult {
  const base = checkComparisonCompatibility(input.a, input.b);
  const reasons = [...base.reasons];
  const held = HELD_EQUAL[input.mode];

  for (const key of held) {
    const aVal = fieldValue(input.a, key);
    const bVal = fieldValue(input.b, key);
    if (aVal !== undefined && bVal !== undefined && aVal !== bVal) {
      reasons.push(`held-equal violation (${input.mode}): ${key} differs (${aVal} vs ${bVal})`);
    }
  }

  const varying = varyingDimension(input.mode);
  const allSame = varying.every((key) => {
    const aVal = fieldValue(input.a, key);
    const bVal = fieldValue(input.b, key);
    if (aVal === undefined && bVal === undefined) return true;
    return aVal === bVal;
  });
  if (allSame && input.mode !== "combination") {
    reasons.push(`${input.mode} comparison requires differing ${varying.join(", ")}`);
  }

  const comparable = reasons.length === 0;
  return Object.freeze({
    compatible: base.compatible && comparable,
    reasons: Object.freeze(reasons),
    mode: input.mode,
    comparable,
    status: comparable ? "COMPARABLE" : "INCOMPARABLE",
  });
}

export function filterFairComparableRecords(
  mode: ExperimentComparisonMode,
  baseline: ModelPerformanceRecord,
  candidates: readonly ModelPerformanceRecord[],
): readonly ModelPerformanceRecord[] {
  return candidates.filter(
    (c) => checkFairComparison({ mode, a: baseline, b: c }).comparable,
  );
}
