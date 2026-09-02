/**
 * Step 8 — Evidence-based specialization detection.
 */

import type { PerformanceFingerprint } from "../contracts/model-performance-record";
import { checkComparisonCompatibility } from "../intelligence/comparison-compatibility";
import type { ModelPerformanceRecord } from "../contracts/model-performance-record";
import {
  DEFAULT_SPECIALIZATION_THRESHOLDS,
  meetsConfidenceThreshold,
  type SpecializationThresholds,
} from "./evidence-collection-config";
import { filterValidComparisonRecords } from "./evidence-validity";
import { aggregateRecordsInMemory } from "../intelligence/performance-aggregator";

export type SpecializationCandidate = {
  readonly status: "SPECIALIZATION" | "INSUFFICIENT_EVIDENCE" | "NOT_SIGNIFICANT";
  readonly model: { readonly providerId: string; readonly modelId: string };
  readonly scope: string;
  readonly service?: string;
  readonly industry?: string;
  readonly complexity?: string;
  readonly strategyId?: string;
  readonly metric: "qualityScore" | "hardRequirementPassRate";
  readonly modelValue: number;
  readonly comparisonValue?: number;
  readonly advantage: number;
  readonly sampleCount: number;
  readonly validComparisonSamples: number;
  readonly confidence: PerformanceFingerprint["confidence"];
  readonly evidenceWindow: { readonly start: string; readonly end: string };
  readonly reason: string;
};

export type ModelComparisonResult = {
  readonly status: "COMPARABLE" | "INCOMPATIBLE" | "INSUFFICIENT_EVIDENCE";
  readonly modelA: { readonly providerId: string; readonly modelId: string };
  readonly modelB: { readonly providerId: string; readonly modelId: string };
  readonly scope: string;
  readonly compatibility: { readonly compatible: boolean; readonly reasons: readonly string[] };
  readonly qualityDelta?: number;
  readonly hardComplianceDelta?: number;
  readonly latencyDelta?: number;
  readonly costDelta?: number | null;
  readonly modelAFingerprint?: PerformanceFingerprint;
  readonly modelBFingerprint?: PerformanceFingerprint;
  readonly tradeOffs: readonly string[];
  readonly reason?: string;
};

function scopeLabel(fp: PerformanceFingerprint): string {
  return [
    fp.service,
    fp.subtype ?? "*",
    fp.industry ?? "*",
    fp.complexity ?? "*",
    fp.strategyId ?? "*",
  ].join("/");
}

export function detectSpecializations(input: {
  readonly fingerprints: readonly PerformanceFingerprint[];
  readonly thresholds?: SpecializationThresholds;
  readonly baselineQuality?: number;
}): readonly SpecializationCandidate[] {
  const thresholds = input.thresholds ?? DEFAULT_SPECIALIZATION_THRESHOLDS;
  const results: SpecializationCandidate[] = [];

  for (const fp of input.fingerprints) {
    for (const metric of ["qualityScore", "hardRequirementPassRate"] as const) {
      const value =
        metric === "qualityScore"
          ? fp.qualityScoreMean
          : fp.hardRequirementPassRateMean * 100;
      const baseline = input.baselineQuality ?? 70;
      const advantage = value - baseline;

      if (fp.validComparisonSamples < thresholds.minSampleCount) {
        results.push(
          Object.freeze({
            status: "INSUFFICIENT_EVIDENCE",
            model: Object.freeze({ providerId: fp.providerId, modelId: fp.modelId }),
            scope: scopeLabel(fp),
            service: fp.service,
            industry: fp.industry,
            complexity: fp.complexity,
            strategyId: fp.strategyId,
            metric,
            modelValue: value,
            advantage,
            sampleCount: fp.sampleCount,
            validComparisonSamples: fp.validComparisonSamples,
            confidence: fp.confidence,
            evidenceWindow: Object.freeze({ start: fp.windowStart, end: fp.windowEnd }),
            reason: `Insufficient valid comparison samples (${fp.validComparisonSamples} < ${thresholds.minSampleCount})`,
          }),
        );
        continue;
      }

      if (!meetsConfidenceThreshold(fp.confidence, thresholds.minConfidenceLevel)) {
        results.push(
          Object.freeze({
            status: "INSUFFICIENT_EVIDENCE",
            model: Object.freeze({ providerId: fp.providerId, modelId: fp.modelId }),
            scope: scopeLabel(fp),
            service: fp.service,
            industry: fp.industry,
            complexity: fp.complexity,
            strategyId: fp.strategyId,
            metric,
            modelValue: value,
            advantage,
            sampleCount: fp.sampleCount,
            validComparisonSamples: fp.validComparisonSamples,
            confidence: fp.confidence,
            evidenceWindow: Object.freeze({ start: fp.windowStart, end: fp.windowEnd }),
            reason: `Confidence ${fp.confidence.level} below threshold ${thresholds.minConfidenceLevel}`,
          }),
        );
        continue;
      }

      if (advantage < thresholds.minPerformanceAdvantage) {
        results.push(
          Object.freeze({
            status: "NOT_SIGNIFICANT",
            model: Object.freeze({ providerId: fp.providerId, modelId: fp.modelId }),
            scope: scopeLabel(fp),
            service: fp.service,
            industry: fp.industry,
            complexity: fp.complexity,
            strategyId: fp.strategyId,
            metric,
            modelValue: value,
            advantage,
            sampleCount: fp.sampleCount,
            validComparisonSamples: fp.validComparisonSamples,
            confidence: fp.confidence,
            evidenceWindow: Object.freeze({ start: fp.windowStart, end: fp.windowEnd }),
            reason: `Advantage ${advantage.toFixed(1)} below threshold ${thresholds.minPerformanceAdvantage}`,
          }),
        );
        continue;
      }

      results.push(
        Object.freeze({
          status: "SPECIALIZATION",
          model: Object.freeze({ providerId: fp.providerId, modelId: fp.modelId }),
          scope: scopeLabel(fp),
          service: fp.service,
          industry: fp.industry,
          complexity: fp.complexity,
          strategyId: fp.strategyId,
          metric,
          modelValue: value,
          advantage,
          sampleCount: fp.sampleCount,
          validComparisonSamples: fp.validComparisonSamples,
          confidence: fp.confidence,
          evidenceWindow: Object.freeze({ start: fp.windowStart, end: fp.windowEnd }),
          reason: `Strong ${metric} performance (${value.toFixed(1)}) with ${fp.validComparisonSamples} valid samples`,
        }),
      );
    }
  }

  return Object.freeze(results);
}

export function compareModelsAtScope(input: {
  readonly records: readonly ModelPerformanceRecord[];
  readonly modelA: { readonly providerId: string; readonly modelId: string };
  readonly modelB: { readonly providerId: string; readonly modelId: string };
  readonly aggregationLevel?: 2 | 4 | 5 | 6;
  readonly significanceThreshold?: number;
}): readonly ModelComparisonResult[] {
  const level = input.aggregationLevel ?? 4;
  const threshold = input.significanceThreshold ?? 5;

  const recordsA = input.records.filter(
    (r) => r.providerId === input.modelA.providerId && r.modelId === input.modelA.modelId,
  );
  const recordsB = input.records.filter(
    (r) => r.providerId === input.modelB.providerId && r.modelId === input.modelB.modelId,
  );

  const validA = filterValidComparisonRecords(recordsA);
  const validB = filterValidComparisonRecords(recordsB);

  if (validA.length === 0 || validB.length === 0) {
    return Object.freeze([
      Object.freeze({
        status: "INSUFFICIENT_EVIDENCE",
        modelA: input.modelA,
        modelB: input.modelB,
        scope: "*",
        compatibility: Object.freeze({ compatible: false, reasons: Object.freeze(["insufficient valid comparison samples"]) }),
        tradeOffs: Object.freeze([]),
        reason: `Model A valid=${validA.length}, Model B valid=${validB.length}`,
      }),
    ]);
  }

  const fpsA = aggregateRecordsInMemory(validA, level);
  const fpsB = aggregateRecordsInMemory(validB, level);
  const results: ModelComparisonResult[] = [];

  for (const fpA of fpsA) {
    const scope = scopeLabel(fpA);
    const fpB = fpsB.find((b) => scopeLabel(b) === scope);
    if (!fpB) continue;

    const sampleA = validA.find((r) => r.service === fpA.service);
    const sampleB = validB.find((r) => r.service === fpB.service);
    const compatibility =
      sampleA && sampleB
        ? checkComparisonCompatibility(sampleA, sampleB)
        : Object.freeze({ compatible: true, reasons: Object.freeze([]) });

    if (!compatibility.compatible) {
      results.push(
        Object.freeze({
          status: "INCOMPATIBLE",
          modelA: input.modelA,
          modelB: input.modelB,
          scope,
          compatibility,
          tradeOffs: Object.freeze([]),
          reason: compatibility.reasons.join("; "),
        }),
      );
      continue;
    }

    const qualityDelta = fpA.qualityScoreMean - fpB.qualityScoreMean;
    const hardComplianceDelta =
      (fpA.hardRequirementPassRateMean - fpB.hardRequirementPassRateMean) * 100;
    const latencyDelta = fpA.latencyMsMean - fpB.latencyMsMean;
    const costDelta =
      fpA.costMean != null && fpB.costMean != null ? fpA.costMean - fpB.costMean : null;

    const tradeOffs: string[] = [];
    if (Math.abs(qualityDelta) >= threshold) {
      tradeOffs.push(
        qualityDelta > 0
          ? `${input.modelA.modelId} +${qualityDelta.toFixed(1)} quality vs ${input.modelB.modelId}`
          : `${input.modelB.modelId} +${Math.abs(qualityDelta).toFixed(1)} quality vs ${input.modelA.modelId}`,
      );
    }
    if (Math.abs(hardComplianceDelta) >= threshold) {
      tradeOffs.push(
        hardComplianceDelta > 0
          ? `${input.modelA.modelId} +${hardComplianceDelta.toFixed(1)}% hard compliance`
          : `${input.modelB.modelId} +${Math.abs(hardComplianceDelta).toFixed(1)}% hard compliance`,
      );
    }
    if (Math.abs(latencyDelta) >= 1000) {
      tradeOffs.push(
        latencyDelta < 0
          ? `${input.modelA.modelId} ${Math.abs(latencyDelta).toFixed(0)}ms faster`
          : `${input.modelB.modelId} ${latencyDelta.toFixed(0)}ms faster`,
      );
    }
    if (costDelta != null && Math.abs(costDelta) >= 0.001) {
      tradeOffs.push(
        costDelta < 0
          ? `${input.modelA.modelId} lower cost ($${Math.abs(costDelta).toFixed(4)})`
          : `${input.modelB.modelId} lower cost ($${costDelta.toFixed(4)})`,
      );
    }

    results.push(
      Object.freeze({
        status: "COMPARABLE",
        modelA: input.modelA,
        modelB: input.modelB,
        scope,
        compatibility,
        qualityDelta,
        hardComplianceDelta,
        latencyDelta,
        costDelta,
        modelAFingerprint: fpA,
        modelBFingerprint: fpB,
        tradeOffs: Object.freeze(tradeOffs),
      }),
    );
  }

  return Object.freeze(results);
}

export function findMaterialDifferences(
  comparisons: readonly ModelComparisonResult[],
  significanceThreshold = 5,
): readonly ModelComparisonResult[] {
  return comparisons.filter(
    (c) =>
      c.status === "COMPARABLE" &&
      ((c.qualityDelta != null && Math.abs(c.qualityDelta) >= significanceThreshold) ||
        (c.hardComplianceDelta != null &&
          Math.abs(c.hardComplianceDelta) >= significanceThreshold)),
  );
}

export function strongestAreas(
  fingerprints: readonly PerformanceFingerprint[],
  limit = 5,
): readonly SpecializationCandidate[] {
  return detectSpecializations({ fingerprints })
    .filter((s) => s.status === "SPECIALIZATION")
    .sort((a, b) => b.advantage - a.advantage)
    .slice(0, limit);
}

export function weakestAreas(
  fingerprints: readonly PerformanceFingerprint[],
  limit = 5,
): readonly SpecializationCandidate[] {
  return detectSpecializations({ fingerprints, baselineQuality: 80 })
    .filter((s) => s.status === "NOT_SIGNIFICANT" || s.advantage < 0)
    .sort((a, b) => a.advantage - b.advantage)
    .slice(0, limit);
}
