/**
 * Step 8 — Evidence coverage audit across model × service × industry cells.
 */

import type { BenchmarkCase } from "../contracts/benchmark-case";
import type { ModelPerformanceRecord } from "../contracts/model-performance-record";
import { listBenchmarkCases } from "../catalog/benchmark-catalog";
import { filterValidComparisonRecords } from "./evidence-validity";
import { resolveEvidenceTier } from "./evidence-collection-config";

export type EvidenceCoverageCellStatus =
  | "NO_EVIDENCE"
  | "INSUFFICIENT_EVIDENCE"
  | "LOW_EVIDENCE"
  | "MODERATE_EVIDENCE"
  | "STRONG_EVIDENCE"
  | "POOR_PERFORMANCE"
  | "EXECUTION_UNAVAILABLE"
  | "UNSUPPORTED_CAPABILITY";

export type EvidenceCoverageCell = {
  readonly cellKey: string;
  readonly benchmarkId?: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly service?: string;
  readonly subtype?: string;
  readonly industry?: string;
  readonly complexity?: string;
  readonly status: EvidenceCoverageCellStatus;
  readonly sampleCount: number;
  readonly validComparisonSamples: number;
  readonly operationalFailures: number;
  readonly capabilityFailures: number;
  readonly qualityScoreMean?: number;
  readonly hardRequirementPassRateMean?: number;
};

export type EvidenceCoverageReport = {
  readonly cells: readonly EvidenceCoverageCell[];
  readonly totalCells: number;
  readonly cellsWithEvidence: number;
  readonly cellsWithSufficientEvidence: number;
  readonly cellsWithNoEvidence: number;
  readonly summary: readonly string[];
};

function cellStatus(input: {
  readonly sampleCount: number;
  readonly validComparisonSamples: number;
  readonly operationalFailures: number;
  readonly capabilityFailures: number;
  readonly qualityScoreMean?: number;
}): EvidenceCoverageCellStatus {
  if (input.sampleCount === 0) return "NO_EVIDENCE";
  if (input.capabilityFailures > 0 && input.validComparisonSamples === 0) {
    return input.capabilityFailures >= input.sampleCount
      ? "UNSUPPORTED_CAPABILITY"
      : "EXECUTION_UNAVAILABLE";
  }
  if (input.validComparisonSamples === 0 && input.operationalFailures > 0) {
    return "EXECUTION_UNAVAILABLE";
  }
  const tier = resolveEvidenceTier(input.validComparisonSamples);
  if (tier === "INSUFFICIENT") return "INSUFFICIENT_EVIDENCE";
  if (tier === "LOW") return "LOW_EVIDENCE";
  if (tier === "MODERATE") return "MODERATE_EVIDENCE";
  if (input.qualityScoreMean != null && input.qualityScoreMean < 40) {
    return "POOR_PERFORMANCE";
  }
  return "STRONG_EVIDENCE";
}

export function auditEvidenceCoverage(input: {
  readonly records: readonly ModelPerformanceRecord[];
  readonly benchmarkCases?: readonly BenchmarkCase[];
  readonly models?: readonly { readonly providerId: string; readonly modelId: string }[];
}): EvidenceCoverageReport {
  const cases = input.benchmarkCases ?? listBenchmarkCases();
  const models =
    input.models ??
    [...new Map(input.records.map((r) => [`${r.providerId}:${r.modelId}`, r])).values()].map(
      (r) => Object.freeze({ providerId: r.providerId, modelId: r.modelId }),
    );

  const cells: EvidenceCoverageCell[] = [];

  for (const model of models) {
    for (const bc of cases) {
      const cellRecords = input.records.filter(
        (r) =>
          r.providerId === model.providerId &&
          r.modelId === model.modelId &&
          r.benchmarkId === bc.benchmarkId,
      );
      const valid = filterValidComparisonRecords(cellRecords);
      const operationalFailures = cellRecords.filter(
        (r) => r.benchmarkOutcome === "PROVIDER_OPERATIONAL_FAILURE",
      ).length;
      const capabilityFailures = cellRecords.filter(
        (r) =>
          r.benchmarkOutcome === "EXECUTION_CAPABILITY_UNAVAILABLE" ||
          r.benchmarkOutcome === "MODEL_CAPABILITY_UNSUPPORTED",
      ).length;

      const qualityScores = valid.map((r) => r.qualityScore);
      const hardRates = valid.map((r) => r.hardRequirementPassRate);
      const qualityScoreMean =
        qualityScores.length > 0
          ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length
          : undefined;
      const hardRequirementPassRateMean =
        hardRates.length > 0
          ? hardRates.reduce((a, b) => a + b, 0) / hardRates.length
          : undefined;

      cells.push(
        Object.freeze({
          cellKey: `${model.modelId}@${bc.benchmarkId}`,
          benchmarkId: bc.benchmarkId,
          providerId: model.providerId,
          modelId: model.modelId,
          service: bc.service,
          subtype: bc.subtype,
          industry: bc.industry,
          complexity: bc.complexity,
          status: cellStatus({
            sampleCount: cellRecords.length,
            validComparisonSamples: valid.length,
            operationalFailures,
            capabilityFailures,
            qualityScoreMean,
          }),
          sampleCount: cellRecords.length,
          validComparisonSamples: valid.length,
          operationalFailures,
          capabilityFailures,
          qualityScoreMean,
          hardRequirementPassRateMean,
        }),
      );
    }
  }

  const cellsWithEvidence = cells.filter((c) => c.sampleCount > 0).length;
  const cellsWithSufficientEvidence = cells.filter(
    (c) =>
      c.status === "MODERATE_EVIDENCE" ||
      c.status === "STRONG_EVIDENCE" ||
      c.status === "POOR_PERFORMANCE",
  ).length;
  const cellsWithNoEvidence = cells.filter((c) => c.status === "NO_EVIDENCE").length;

  return Object.freeze({
    cells: Object.freeze(cells),
    totalCells: cells.length,
    cellsWithEvidence,
    cellsWithSufficientEvidence,
    cellsWithNoEvidence,
    summary: Object.freeze([
      `${cellsWithEvidence}/${cells.length} cells have any evidence`,
      `${cellsWithSufficientEvidence}/${cells.length} cells have sufficient valid comparison evidence`,
      `${cellsWithNoEvidence}/${cells.length} cells have no evidence`,
    ]),
  });
}
