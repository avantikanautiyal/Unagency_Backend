/**
 * Fair comparison compatibility check between benchmark results.
 */

import type { BenchmarkExecutionConditions } from "../contracts/benchmark-case";
import type {
  ModelPerformanceRecord,
  ComparisonCompatibility,
} from "../contracts/model-performance-record";

export function checkComparisonCompatibility(
  a: ModelPerformanceRecord | BenchmarkExecutionConditions,
  b: ModelPerformanceRecord | BenchmarkExecutionConditions,
): ComparisonCompatibility {
  const reasons: string[] = [];

  const fields: Array<{
    key: string;
    aVal: string | undefined;
    bVal: string | undefined;
  }> = [
    {
      key: "benchmarkId",
      aVal: "benchmarkId" in a ? a.benchmarkId : undefined,
      bVal: "benchmarkId" in b ? b.benchmarkId : undefined,
    },
    {
      key: "benchmarkVersion",
      aVal: "benchmarkVersion" in a ? a.benchmarkVersion : undefined,
      bVal: "benchmarkVersion" in b ? b.benchmarkVersion : undefined,
    },
    {
      key: "contractVersion",
      aVal: a.contractVersion,
      bVal: b.contractVersion,
    },
    {
      key: "strategyVersion",
      aVal: "strategyVersion" in a ? a.strategyVersion : undefined,
      bVal: "strategyVersion" in b ? b.strategyVersion : undefined,
    },
    {
      key: "evaluatorVersion",
      aVal: "evaluatorVersion" in a ? a.evaluatorVersion : undefined,
      bVal: "evaluatorVersion" in b ? b.evaluatorVersion : undefined,
    },
    {
      key: "knowledgeVersion",
      aVal: "knowledgeVersion" in a ? a.knowledgeVersion : undefined,
      bVal: "knowledgeVersion" in b ? b.knowledgeVersion : undefined,
    },
  ];

  for (const { key, aVal, bVal } of fields) {
    if (aVal !== undefined && bVal !== undefined && aVal !== bVal) {
      reasons.push(`${key} mismatch: ${aVal} vs ${bVal}`);
    }
  }

  if ("modelVersion" in a && "modelVersion" in b) {
    if (a.modelVersion && b.modelVersion && a.modelVersion !== b.modelVersion) {
      reasons.push(`modelVersion mismatch: ${a.modelVersion} vs ${b.modelVersion}`);
    }
  }

  if ("requiredCapabilityId" in a && "requiredCapabilityId" in b) {
    if (
      a.requiredCapabilityId &&
      b.requiredCapabilityId &&
      a.requiredCapabilityId !== b.requiredCapabilityId
    ) {
      reasons.push(
        `requiredCapabilityId mismatch: ${a.requiredCapabilityId} vs ${b.requiredCapabilityId}`,
      );
    }
  }

  if ("executionProfileVersion" in a && "executionProfileVersion" in b) {
    if (
      a.executionProfileVersion &&
      b.executionProfileVersion &&
      a.executionProfileVersion !== b.executionProfileVersion
    ) {
      reasons.push(
        `executionProfileVersion mismatch: ${a.executionProfileVersion} vs ${b.executionProfileVersion}`,
      );
    }
  }

  if ("artifactEvaluatorVersion" in a && "artifactEvaluatorVersion" in b) {
    if (
      a.artifactEvaluatorVersion &&
      b.artifactEvaluatorVersion &&
      a.artifactEvaluatorVersion !== b.artifactEvaluatorVersion
    ) {
      reasons.push(
        `artifactEvaluatorVersion mismatch: ${a.artifactEvaluatorVersion} vs ${b.artifactEvaluatorVersion}`,
      );
    }
  }

  if ("evaluationPlaneVersion" in a && "evaluationPlaneVersion" in b) {
    if (
      a.evaluationPlaneVersion &&
      b.evaluationPlaneVersion &&
      a.evaluationPlaneVersion !== b.evaluationPlaneVersion
    ) {
      reasons.push(
        `evaluationPlaneVersion mismatch: ${a.evaluationPlaneVersion} vs ${b.evaluationPlaneVersion}`,
      );
    }
  }

  if ("benchmarkOutcome" in a && "benchmarkOutcome" in b) {
    const fairOutcomes = new Set(["MODEL_SUCCESS", "MODEL_QUALITY_FAILURE"]);
    const aFair = fairOutcomes.has(a.benchmarkOutcome);
    const bFair = fairOutcomes.has(b.benchmarkOutcome);
    if (aFair !== bFair) {
      reasons.push(
        `benchmarkOutcome comparability mismatch: ${a.benchmarkOutcome} vs ${b.benchmarkOutcome}`,
      );
    }
  }

  if ("validForModelComparison" in a && "validForModelComparison" in b) {
    if (a.validForModelComparison !== b.validForModelComparison) {
      reasons.push(
        `validForModelComparison mismatch: ${a.validForModelComparison} vs ${b.validForModelComparison}`,
      );
    }
  }

  return Object.freeze({
    compatible: reasons.length === 0,
    reasons: Object.freeze(reasons),
  });
}

export function filterComparableRecords(
  baseline: ModelPerformanceRecord,
  candidates: readonly ModelPerformanceRecord[],
): readonly ModelPerformanceRecord[] {
  return candidates.filter((c) => checkComparisonCompatibility(baseline, c).compatible);
}
