/**
 * Human-readable benchmark run report.
 */

import type { ModelPerformanceRecord } from "../contracts/model-performance-record";
import type { OutputValidationResult } from "../../../../../os/evaluation/output-validation/validation-result";
import type { BenchmarkCase } from "../contracts/benchmark-case";
import type { BenchmarkExecutionConditions } from "../contracts/benchmark-case";
import type { ComparisonCompatibility } from "../contracts/model-performance-record";

export type BenchmarkRunReport = {
  readonly benchmarkId: string;
  readonly benchmarkVersion: string;
  readonly model: { readonly providerId: string; readonly modelId: string; readonly modelVersion?: string };
  readonly service: string;
  readonly subtype: string;
  readonly outputKind: string;
  readonly industry?: string;
  readonly complexity: string;
  readonly contractVersion: string;
  readonly strategyVersion: string;
  readonly knowledgeVersion?: string;
  readonly evaluatorVersion: string;
  readonly hardRequirements: {
    readonly total: number;
    readonly passed: number;
    readonly failed: number;
    readonly unverified: number;
    readonly passRate: number;
    readonly criticalFailures: number;
    readonly mandatoryFailures: readonly string[];
  };
  readonly quality: {
    readonly overallScore: number;
    readonly dimensions: Readonly<Record<string, number>>;
    readonly measuredDimensions: readonly string[];
    readonly unmeasuredDimensions: readonly string[];
  };
  readonly operational: {
    readonly latencyMs: number;
    readonly modelLatencyMs?: number;
    readonly cost?: number | null;
    readonly costAvailable: boolean;
    readonly reliabilityStatus: string;
    readonly operationalFailureCategory?: string;
  };
  readonly calibration: {
    readonly benchmarkOutcome: string;
    readonly requiredCapabilityId: string;
    readonly validForModelComparison: boolean;
    readonly qualityScoreInterpretation?: string;
    readonly executionProfileVersion: string;
  };
  readonly validation: {
    readonly status: string;
    readonly completionAllowed: boolean;
  };
  readonly failures: Readonly<Record<string, number>>;
  readonly versions: readonly { readonly field: string; readonly value: string }[];
  readonly textReport: string;
};

export function buildBenchmarkRunReport(input: {
  readonly benchmarkCase: BenchmarkCase;
  readonly record: ModelPerformanceRecord;
  readonly conditions?: BenchmarkExecutionConditions;
  readonly validation?: OutputValidationResult;
}): BenchmarkRunReport {
  const { record: r, benchmarkCase: bc } = input;

  const hardRequirements = Object.freeze({
    total: r.hardRequirementsTotal,
    passed: r.hardRequirementsPassed,
    failed: r.hardRequirementsTotal - r.hardRequirementsPassed,
    unverified: input.validation?.hardRequirementSummary.unverified ?? 0,
    passRate: r.hardRequirementPassRate,
    criticalFailures: r.criticalFailures,
    mandatoryFailures: r.mandatoryRequirementFailures,
  });

  const quality = Object.freeze({
    overallScore: r.qualityScore,
    dimensions: r.qualityDimensions,
    measuredDimensions: r.measuredQualityDimensions,
    unmeasuredDimensions: r.unmeasuredQualityDimensions,
  });

  const operational = Object.freeze({
    latencyMs: r.latencyMs,
    modelLatencyMs: r.modelLatencyMs,
    cost: r.estimatedCost,
    costAvailable: r.costAvailable,
    reliabilityStatus: r.reliabilityStatus,
    operationalFailureCategory: r.operationalFailureCategory,
  });

  const calibration = Object.freeze({
    benchmarkOutcome: r.benchmarkOutcome,
    requiredCapabilityId: r.requiredCapabilityId,
    validForModelComparison: r.validForModelComparison,
    qualityScoreInterpretation: r.qualityScoreInterpretation,
    executionProfileVersion: r.executionProfileVersion,
  });

  const validation = Object.freeze({
    status: r.validationStatus,
    completionAllowed: r.completionAllowed,
  });

  const lines = [
    `Benchmark Run Report`,
    `====================`,
    ``,
    `Benchmark: ${bc.benchmarkId} (v${bc.version})`,
    `Model: ${r.providerId} / ${r.modelId}${r.modelVersion ? ` (${r.modelVersion})` : ""}`,
    `Service: ${r.service}/${r.subtype} | Output: ${r.outputKind}`,
    r.industry ? `Industry: ${r.industry}` : "",
    `Complexity: ${r.complexity}`,
    ``,
    `Benchmark outcome: ${r.benchmarkOutcome}`,
    r.validForModelComparison
      ? `Valid for model comparison: yes`
      : `Valid for model comparison: no`,
    r.qualityScoreInterpretation ? `Quality note: ${r.qualityScoreInterpretation}` : "",
    ``,
    `Versions:`,
    `  Contract: ${r.contractVersion}`,
    `  Strategy: ${r.strategyId} v${r.strategyVersion}`,
    r.knowledgeVersion ? `  Knowledge: ${r.knowledgeVersion}` : "  Knowledge: (none)",
    `  Evaluator: ${r.evaluatorVersion}`,
    ``,
    `Hard Requirements:`,
    `  Pass rate: ${(r.hardRequirementPassRate * 100).toFixed(1)}% (${r.hardRequirementsPassed}/${r.hardRequirementsTotal})`,
    `  Critical failures: ${r.criticalFailures}`,
    r.mandatoryRequirementFailures.length > 0
      ? `  Mandatory failures: ${r.mandatoryRequirementFailures.join(", ")}`
      : "",
    ``,
    `Quality (measured only):`,
    `  Overall score: ${r.qualityScore}`,
    `  Measured dimensions: ${r.measuredQualityDimensions.join(", ") || "(none)"}`,
    `  Unmeasured (NOT_AUTOMATED): ${r.unmeasuredQualityDimensions.join(", ") || "(none)"}`,
    ...Object.entries(r.qualityDimensions).map(([k, v]) => `    ${k}: ${v}`),
    ``,
    `Operational:`,
    `  Total latency: ${r.latencyMs}ms`,
    r.modelLatencyMs != null ? `  Model latency: ${r.modelLatencyMs}ms` : "",
    r.costAvailable ? `  Cost: $${r.estimatedCost?.toFixed(4) ?? "0"}` : "  Cost: unavailable",
    `  Reliability: ${r.reliabilityStatus}`,
    r.operationalFailureCategory ? `  Failure: ${r.operationalFailureCategory}` : "",
    ``,
    `Validation: ${r.validationStatus} | Completion allowed: ${r.completionAllowed}`,
    Object.keys(r.failureCategories).length > 0
      ? `Failure categories: ${JSON.stringify(r.failureCategories)}`
      : "",
  ].filter(Boolean);

  return Object.freeze({
    benchmarkId: bc.benchmarkId,
    benchmarkVersion: bc.version,
    model: Object.freeze({
      providerId: r.providerId,
      modelId: r.modelId,
      modelVersion: r.modelVersion,
    }),
    service: r.service,
    subtype: r.subtype,
    outputKind: r.outputKind,
    industry: r.industry,
    complexity: r.complexity,
    contractVersion: r.contractVersion,
    strategyVersion: r.strategyVersion,
    knowledgeVersion: r.knowledgeVersion,
    evaluatorVersion: r.evaluatorVersion,
    hardRequirements,
    quality,
    operational,
    calibration,
    validation,
    failures: r.failureCategories,
    versions: r.provenance,
    textReport: lines.join("\n"),
  });
}

export type ModelComparisonEntry = {
  readonly providerId: string;
  readonly modelId: string;
  readonly modelVersion?: string;
  readonly hardRequirementPassRate: number;
  readonly qualityScore: number;
  readonly latencyMs: number;
  readonly cost?: number | null;
  readonly costAvailable: boolean;
  readonly sampleCount: number;
  readonly measuredDimensions: readonly string[];
  readonly unmeasuredDimensions: readonly string[];
  readonly failureProfile: Readonly<Record<string, number>>;
  readonly compatibility: ComparisonCompatibility;
  readonly reliabilityStatus: string;
};

export type BenchmarkComparisonReport = {
  readonly benchmarkId: string;
  readonly scope: string;
  readonly entries: readonly ModelComparisonEntry[];
  readonly textReport: string;
};

export function buildBenchmarkComparisonReport(input: {
  readonly benchmarkId: string;
  readonly scope: string;
  readonly entries: readonly ModelComparisonEntry[];
}): BenchmarkComparisonReport {
  const lines = [
    `Benchmark Comparison Report`,
    `===========================`,
    ``,
    `Benchmark: ${input.benchmarkId}`,
    `Scope: ${input.scope}`,
    ``,
  ];

  for (const e of input.entries) {
    lines.push(
      `${e.providerId} / ${e.modelId}${e.modelVersion ? ` (${e.modelVersion})` : ""}`,
      `  Compatible: ${e.compatibility.compatible ? "yes" : "no — " + e.compatibility.reasons.join("; ")}`,
      `  Compliance: ${(e.hardRequirementPassRate * 100).toFixed(1)}%`,
      `  Quality: ${e.qualityScore.toFixed(1)}`,
      `  Latency: ${(e.latencyMs / 1000).toFixed(1)}s`,
      e.costAvailable ? `  Cost: $${e.cost?.toFixed(4) ?? "0"}` : "  Cost: unavailable",
      `  Samples: ${e.sampleCount}`,
      `  Measured: ${e.measuredDimensions.join(", ") || "(none)"}`,
      `  Unmeasured: ${e.unmeasuredDimensions.join(", ") || "(none)"}`,
      Object.keys(e.failureProfile).length > 0
        ? `  Failures: ${JSON.stringify(e.failureProfile)}`
        : "",
      ``,
    );
  }

  lines.push(`Note: No automatic winner declared — compare dimensions separately.`);

  return Object.freeze({
    benchmarkId: input.benchmarkId,
    scope: input.scope,
    entries: input.entries,
    textReport: lines.filter(Boolean).join("\n"),
  });
}
