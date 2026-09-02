/**
 * Regression detection — per-service/industry performance vs baseline.
 */

import type { ModelPerformanceRecord, PerformanceFingerprint } from "../contracts/model-performance-record";
import { aggregateRecordsInMemory } from "./performance-aggregator";
import { checkComparisonCompatibility } from "./comparison-compatibility";
import { filterValidComparisonRecords } from "../evidence/evidence-validity";
import { isFairModelComparisonOutcome } from "../contracts/benchmark-outcome";

export type RegressionFinding = {
  readonly scope: string;
  readonly metric: "qualityScore" | "hardRequirementPassRate";
  readonly baselineValue: number;
  readonly candidateValue: number;
  readonly delta: number;
  readonly regressionThreshold: number;
  readonly isRegression: boolean;
  readonly baselineSampleCount: number;
  readonly candidateSampleCount: number;
};

export type RegressionReport = {
  readonly baselineModel: { readonly providerId: string; readonly modelId: string };
  readonly candidateModel: { readonly providerId: string; readonly modelId: string };
  readonly findings: readonly RegressionFinding[];
  readonly hasRegressions: boolean;
};

export type RegressionDetectInput = {
  readonly baselineRecords: readonly ModelPerformanceRecord[];
  readonly candidateRecords: readonly ModelPerformanceRecord[];
  readonly regressionThreshold?: number;
  readonly aggregationLevel?: 2 | 4 | 5;
};

const DEFAULT_THRESHOLD = 5;

function recordsForRegressionAnalysis(
  records: readonly ModelPerformanceRecord[],
): readonly ModelPerformanceRecord[] {
  const strict = filterValidComparisonRecords(records);
  if (strict.length > 0) return strict;
  return records.filter((r) => isFairModelComparisonOutcome(r.benchmarkOutcome));
}

export function detectRegressions(input: RegressionDetectInput): RegressionReport {
  const threshold = input.regressionThreshold ?? DEFAULT_THRESHOLD;
  const level = input.aggregationLevel ?? 4;

  const baselineValid = recordsForRegressionAnalysis(input.baselineRecords);
  const candidateValid = recordsForRegressionAnalysis(input.candidateRecords);

  const baselineFps = aggregateRecordsInMemory(baselineValid, level);
  const candidateFps = aggregateRecordsInMemory(candidateValid, level);

  const baselineByScope = new Map(
    baselineFps.map((fp) => [scopeKey(fp), fp]),
  );

  const findings: RegressionFinding[] = [];

  for (const candidateFp of candidateFps) {
    const key = scopeKey(candidateFp);
    const baselineFp = baselineByScope.get(key);
    if (!baselineFp) continue;

    for (const metric of ["qualityScore", "hardRequirementPassRate"] as const) {
      const baselineValue =
        metric === "qualityScore"
          ? baselineFp.qualityScoreMean
          : baselineFp.hardRequirementPassRateMean * 100;
      const candidateValue =
        metric === "qualityScore"
          ? candidateFp.qualityScoreMean
          : candidateFp.hardRequirementPassRateMean * 100;
      const delta = candidateValue - baselineValue;
      const isRegression = delta < -threshold;

      findings.push(
        Object.freeze({
          scope: key,
          metric,
          baselineValue,
          candidateValue,
          delta,
          regressionThreshold: threshold,
          isRegression,
          baselineSampleCount: baselineFp.sampleCount,
          candidateSampleCount: candidateFp.sampleCount,
        }),
      );
    }
  }

  const baseline = baselineValid[0] ?? input.baselineRecords[0];
  const candidate = candidateValid[0] ?? input.candidateRecords[0];

  return Object.freeze({
    baselineModel: Object.freeze({
      providerId: baseline?.providerId ?? "unknown",
      modelId: baseline?.modelId ?? "unknown",
    }),
    candidateModel: Object.freeze({
      providerId: candidate?.providerId ?? "unknown",
      modelId: candidate?.modelId ?? "unknown",
    }),
    findings: Object.freeze(findings),
    hasRegressions: findings.some((f) => f.isRegression),
  });
}

function scopeKey(fp: PerformanceFingerprint): string {
  return [
    fp.service ?? "*",
    fp.subtype ?? "*",
    fp.industry ?? "*",
    fp.complexity ?? "*",
    fp.strategyId ?? "*",
  ].join("/");
}

export type BaselineReference = {
  readonly providerId: string;
  readonly modelId: string;
  readonly modelVersion?: string;
  readonly strategyId?: string;
  readonly strategyVersion?: string;
  readonly label?: string;
};

export function selectBaselineRecords(
  records: readonly ModelPerformanceRecord[],
  baseline: BaselineReference,
): readonly ModelPerformanceRecord[] {
  return records.filter(
    (r) =>
      r.providerId === baseline.providerId &&
      r.modelId === baseline.modelId &&
      (!baseline.modelVersion || r.modelVersion === baseline.modelVersion) &&
      (!baseline.strategyId || r.strategyId === baseline.strategyId),
  );
}

export function compareModelsFairly(
  baselineRecord: ModelPerformanceRecord,
  candidateRecord: ModelPerformanceRecord,
): { compatible: boolean; reasons: readonly string[] } {
  return checkComparisonCompatibility(baselineRecord, candidateRecord);
}
