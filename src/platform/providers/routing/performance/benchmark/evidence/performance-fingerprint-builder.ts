/**
 * Step 8 — Performance intelligence aggregation helpers.
 */

import type {
  ModelPerformanceRecord,
  PerformanceFingerprint,
} from "../contracts/model-performance-record";
import {
  computePerformanceConfidence,
  mean,
  scoreVariance,
} from "../intelligence/confidence-model";
import {
  filterValidComparisonRecords,
  filterOperationalFailureRecords,
} from "./evidence-validity";
import { median } from "./evidence-collection-config";

function aggregateQualityDimensions(
  records: readonly ModelPerformanceRecord[],
): {
  readonly dimensions: Readonly<Record<string, number>>;
  readonly measured: readonly string[];
  readonly unmeasured: readonly string[];
} {
  const dimScores: Record<string, number[]> = {};
  const measuredSet = new Set<string>();
  const unmeasuredSet = new Set<string>();

  for (const r of records) {
    for (const [dim, score] of Object.entries(r.qualityDimensions)) {
      if (!dimScores[dim]) dimScores[dim] = [];
      dimScores[dim]!.push(score);
    }
    for (const d of r.measuredQualityDimensions) measuredSet.add(d);
    for (const d of r.unmeasuredQualityDimensions) unmeasuredSet.add(d);
  }

  const dimensions: Record<string, number> = {};
  for (const [dim, scores] of Object.entries(dimScores)) {
    dimensions[dim] = mean(scores);
  }

  return Object.freeze({
    dimensions: Object.freeze(dimensions),
    measured: Object.freeze([...measuredSet]),
    unmeasured: Object.freeze([...unmeasuredSet]),
  });
}

function provenanceValue(
  records: readonly ModelPerformanceRecord[],
  field: string,
): string | undefined {
  for (const r of records) {
    const entry = r.provenance.find((p) => p.field === field);
    if (entry?.value) return entry.value;
  }
  return undefined;
}

export function buildExtendedFingerprint(input: {
  readonly records: readonly ModelPerformanceRecord[];
  readonly scope: Partial<PerformanceFingerprint>;
  readonly coverageRatio?: number;
}): PerformanceFingerprint | undefined {
  const { records, scope } = input;
  if (records.length === 0) return undefined;

  const validRecords = filterValidComparisonRecords(records);
  const comparisonRecords = validRecords.length > 0 ? validRecords : records;
  const qualityScores = comparisonRecords.map((r) => r.qualityScore);
  const hardRates = comparisonRecords.map((r) => r.hardRequirementPassRate);
  const latencies = comparisonRecords.map((r) => r.latencyMs);
  const costs = comparisonRecords.filter((r) => r.costAvailable).map((r) => r.estimatedCost ?? 0);

  const failureProfile: Record<string, number> = {};
  for (const r of records) {
    for (const [cat, count] of Object.entries(r.failureCategories)) {
      failureProfile[cat] = (failureProfile[cat] ?? 0) + count;
    }
  }

  const successful = records.filter(
    (r) => r.reliabilityStatus === "success" && r.completionAllowed,
  ).length;
  const operationalFailures = filterOperationalFailureRecords(records).length;
  const qualityAgg = aggregateQualityDimensions(comparisonRecords);

  const timestamps = records.map((r) => r.recordedAt).sort();
  const newest = timestamps[timestamps.length - 1] ?? new Date().toISOString();
  const oldest = timestamps[0] ?? newest;
  const recencyDays =
    (Date.now() - new Date(newest).getTime()) / (1000 * 60 * 60 * 24);

  const first = records[0]!;
  const costMean = costs.length > 0 ? mean(costs) : null;

  return Object.freeze({
    providerId: scope.providerId ?? first.providerId,
    modelId: scope.modelId ?? first.modelId,
    modelVersion: scope.modelVersion ?? first.modelVersion,
    service: scope.service ?? first.service,
    subtype: scope.subtype ?? first.subtype,
    outputKind: scope.outputKind ?? first.outputKind,
    industry: scope.industry ?? first.industry,
    platform: scope.platform ?? first.platform,
    format: scope.format ?? first.format,
    complexity: (scope.complexity ?? first.complexity) as PerformanceFingerprint["complexity"],
    strategyId: scope.strategyId ?? first.strategyId,
    contractVersion: scope.contractVersion ?? first.contractVersion,
    knowledgeVersion: scope.knowledgeVersion ?? first.knowledgeVersion,
    benchmarkVersion: first.benchmarkVersion,
    evaluatorVersion: first.evaluatorVersion,
    evaluationPlaneVersion: provenanceValue(records, "evaluationPlaneVersion"),
    artifactEvaluatorVersion: provenanceValue(records, "artifactEvaluatorVersion"),
    sampleCount: records.length,
    successfulSamples: successful,
    failedSamples: records.length - successful,
    validComparisonSamples: validRecords.length,
    operationalFailureSamples: operationalFailures,
    hardRequirementPassRateMean: mean(hardRates),
    qualityScoreMean: mean(qualityScores),
    qualityDimensions: qualityAgg.dimensions,
    measuredQualityDimensions: qualityAgg.measured,
    unmeasuredQualityDimensions: qualityAgg.unmeasured,
    latencyMsMean: mean(latencies),
    latencyMsMedian: median(latencies),
    costMean,
    costPerSuccessfulSample:
      successful > 0 && costMean != null ? costMean * (records.length / successful) : null,
    costPerValidComparisonSample:
      validRecords.length > 0 && costMean != null
        ? costMean * (records.length / validRecords.length)
        : null,
    operationalFailureRate: records.length > 0 ? operationalFailures / records.length : 0,
    failureProfile: Object.freeze(failureProfile),
    confidence: computePerformanceConfidence({
      sampleCount: validRecords.length > 0 ? validRecords.length : records.length,
      scoreVariance: scoreVariance(qualityScores),
      recencyDays,
      coverageRatio: input.coverageRatio,
    }),
    windowStart: oldest,
    windowEnd: newest,
  });
}
