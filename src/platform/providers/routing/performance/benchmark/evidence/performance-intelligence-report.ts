/**
 * Step 8 — Human and machine-readable performance intelligence reports.
 */

import type { PerformanceFingerprint } from "../contracts/model-performance-record";
import type { SpecializationCandidate, ModelComparisonResult } from "./specialization-detector";
import type { EvidenceCoverageReport } from "./evidence-coverage";
import { resolveEvidenceTier } from "./evidence-collection-config";

export type PerformanceIntelligenceReport = {
  readonly model: { readonly providerId: string; readonly modelId: string };
  readonly scope: {
    readonly service?: string;
    readonly subtype?: string;
    readonly industry?: string;
    readonly complexity?: string;
    readonly strategyId?: string;
  };
  readonly evidence: {
    readonly sampleCount: number;
    readonly validComparisonSamples: number;
    readonly evidenceTier: string;
    readonly confidence: PerformanceFingerprint["confidence"];
    readonly windowStart: string;
    readonly windowEnd: string;
  };
  readonly performance: {
    readonly hardCompliancePercent: number;
    readonly qualityScore: number;
    readonly qualityDimensions: Readonly<Record<string, number>>;
    readonly measuredDimensions: readonly string[];
    readonly unmeasuredDimensions: readonly string[];
    readonly latencyMsMean: number;
    readonly latencyMsMedian: number;
    readonly costMean?: number | null;
    readonly costPerSuccessfulSample?: number | null;
    readonly operationalFailureRate: number;
  };
  readonly failures: Readonly<Record<string, number>>;
  readonly versions: Readonly<Record<string, string | undefined>>;
  readonly textReport: string;
  readonly jsonReport: Record<string, unknown>;
};

export function buildPerformanceIntelligenceReport(
  fp: PerformanceFingerprint,
): PerformanceIntelligenceReport {
  const evidenceTier = resolveEvidenceTier(fp.validComparisonSamples);
  const scope = Object.freeze({
    service: fp.service,
    subtype: fp.subtype,
    industry: fp.industry,
    complexity: fp.complexity,
    strategyId: fp.strategyId,
  });

  const performance = Object.freeze({
    hardCompliancePercent: Math.round(fp.hardRequirementPassRateMean * 100),
    qualityScore: Math.round(fp.qualityScoreMean),
    qualityDimensions: fp.qualityDimensions,
    measuredDimensions: fp.measuredQualityDimensions,
    unmeasuredDimensions: fp.unmeasuredQualityDimensions,
    latencyMsMean: Math.round(fp.latencyMsMean),
    latencyMsMedian: Math.round(fp.latencyMsMedian),
    costMean: fp.costMean,
    costPerSuccessfulSample: fp.costPerSuccessfulSample,
    operationalFailureRate: fp.operationalFailureRate,
  });

  const versions = Object.freeze({
    benchmarkVersion: fp.benchmarkVersion,
    contractVersion: fp.contractVersion,
    strategyVersion: fp.strategyId,
    knowledgeVersion: fp.knowledgeVersion,
    evaluatorVersion: fp.evaluatorVersion,
    evaluationPlaneVersion: fp.evaluationPlaneVersion,
    artifactEvaluatorVersion: fp.artifactEvaluatorVersion,
    modelVersion: fp.modelVersion,
  });

  const textReport = [
    `MODEL: ${fp.modelId} (${fp.providerId})`,
    `SERVICE: ${fp.service}${fp.subtype ? ` / ${fp.subtype}` : ""}`,
    fp.industry ? `INDUSTRY: ${fp.industry}` : null,
    fp.complexity ? `COMPLEXITY: ${fp.complexity}` : null,
    fp.strategyId ? `STRATEGY: ${fp.strategyId}` : null,
    "",
    `Samples: ${fp.sampleCount}`,
    `Valid comparisons: ${fp.validComparisonSamples}`,
    `Evidence tier: ${evidenceTier}`,
    `Confidence: ${fp.confidence.level.toUpperCase()} — ${fp.confidence.reason}`,
    "",
    `Hard compliance: ${performance.hardCompliancePercent}%`,
    `Quality: ${performance.qualityScore}`,
    ...Object.entries(fp.qualityDimensions).map(
      ([dim, score]) => `  ${dim}: ${Math.round(score)}`,
    ),
    "",
    `Latency: ${performance.latencyMsMedian}ms median (${performance.latencyMsMean}ms mean)`,
    fp.costMean != null ? `Cost: $${fp.costMean.toFixed(4)} mean` : "Cost: not available",
    fp.costPerSuccessfulSample != null
      ? `Cost per successful: $${fp.costPerSuccessfulSample.toFixed(4)}`
      : null,
    "",
    Object.keys(fp.failureProfile).length > 0
      ? `Dominant failures:\n${Object.entries(fp.failureProfile)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([k, v]) => `  - ${k}: ${v}`)
          .join("\n")}`
      : "Dominant failures: none recorded",
    "",
    `Evidence window: ${fp.windowStart} → ${fp.windowEnd}`,
    "",
    "Versions:",
    ...Object.entries(versions)
      .filter(([, v]) => v)
      .map(([k, v]) => `  ${k}: ${v}`),
    "",
    fp.unmeasuredQualityDimensions.length > 0
      ? `NOT_AUTOMATED dimensions: ${fp.unmeasuredQualityDimensions.join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const jsonReport = Object.freeze({
    model: { providerId: fp.providerId, modelId: fp.modelId, modelVersion: fp.modelVersion },
    scope,
    evidence: Object.freeze({
      sampleCount: fp.sampleCount,
      validComparisonSamples: fp.validComparisonSamples,
      evidenceTier,
      confidence: fp.confidence,
      windowStart: fp.windowStart,
      windowEnd: fp.windowEnd,
    }),
    performance,
    failures: fp.failureProfile,
    versions,
  });

  return Object.freeze({
    model: Object.freeze({ providerId: fp.providerId, modelId: fp.modelId }),
    scope,
    evidence: Object.freeze({
      sampleCount: fp.sampleCount,
      validComparisonSamples: fp.validComparisonSamples,
      evidenceTier,
      confidence: fp.confidence,
      windowStart: fp.windowStart,
      windowEnd: fp.windowEnd,
    }),
    performance,
    failures: fp.failureProfile,
    versions,
    textReport,
    jsonReport,
  });
}

export function formatCoverageReport(report: EvidenceCoverageReport): string {
  return [
    "=== Evidence Coverage Audit ===",
    ...report.summary,
    "",
    "Sample cells:",
    ...report.cells
      .filter((c) => c.sampleCount > 0 || c.status === "NO_EVIDENCE")
      .slice(0, 12)
      .map(
        (c) =>
          `  ${c.cellKey}: ${c.status} (samples=${c.sampleCount}, valid=${c.validComparisonSamples})`,
      ),
  ].join("\n");
}

export function formatSpecializationReport(
  candidates: readonly SpecializationCandidate[],
): string {
  const specializations = candidates.filter((c) => c.status === "SPECIALIZATION");
  const insufficient = candidates.filter((c) => c.status === "INSUFFICIENT_EVIDENCE");

  return [
    "=== Specialization Analysis ===",
    `Specializations found: ${specializations.length}`,
    `Insufficient evidence: ${insufficient.length}`,
    "",
    ...specializations.slice(0, 10).map(
      (s) =>
        `  ${s.model.modelId} @ ${s.scope}: ${s.metric}=${s.modelValue.toFixed(1)} (+${s.advantage.toFixed(1)}) [${s.validComparisonSamples} valid samples, ${s.confidence.level}]`,
    ),
  ].join("\n");
}

export function formatModelComparisonReport(
  comparisons: readonly ModelComparisonResult[],
): string {
  return [
    "=== Model Comparison ===",
    ...comparisons.slice(0, 10).map((c) => {
      if (c.status !== "COMPARABLE") {
        return `  ${c.scope}: ${c.status} — ${c.reason ?? c.compatibility.reasons.join("; ")}`;
      }
      return [
        `  ${c.scope}:`,
        `    Quality Δ: ${c.qualityDelta?.toFixed(1) ?? "n/a"}`,
        `    Hard compliance Δ: ${c.hardComplianceDelta?.toFixed(1) ?? "n/a"}%`,
        `    Latency Δ: ${c.latencyDelta?.toFixed(0) ?? "n/a"}ms`,
        ...(c.tradeOffs.length > 0 ? [`    Trade-offs: ${c.tradeOffs.join("; ")}`] : []),
      ].join("\n");
    }),
  ].join("\n");
}
