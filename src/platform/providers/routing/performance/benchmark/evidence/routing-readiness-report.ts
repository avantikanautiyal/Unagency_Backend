/**
 * Step 15 — Routing readiness assessment (does NOT activate adaptive routing).
 */

import type { ModelPerformanceRecord } from "../contracts/model-performance-record";
import type { PerformanceFingerprint } from "../contracts/model-performance-record";
import {
  resolveEvidenceTier,
  DEFAULT_EVIDENCE_TIER_THRESHOLDS,
} from "./evidence-collection-config";
import {
  filterValidComparisonRecords,
  filterObservationalProductionRecords,
  separateEvidenceQuality,
} from "./evidence-validity";
import {
  compareModelsAtScope,
  detectSpecializations,
  type ModelComparisonResult,
  type SpecializationCandidate,
} from "./specialization-detector";
import { buildPerformanceIntelligenceReport } from "./performance-intelligence-report";
import { aggregateRecordsInMemory } from "../intelligence/performance-aggregator";
import { assessPromotionReadiness } from "../shadow/promotion-readiness";
import type { OptimizationRecommendation } from "../experiment/recommendations/optimization-recommendations";

export type RoutingReadinessStatus =
  | "NOT_READY"
  | "INSUFFICIENT_EVIDENCE"
  | "INCOMPARABLE"
  | "CAPABILITY_RISK"
  | "QUALITY_RISK"
  | "COST_RISK"
  | "LATENCY_RISK"
  | "RELIABILITY_RISK"
  | "READY_FOR_HUMAN_REVIEW";

export type ModelServicePerformanceBreakdown = {
  readonly providerId: string;
  readonly modelId: string;
  readonly service: string;
  readonly subtype?: string;
  readonly contractCompliancePercent: number;
  readonly hardRequirementPassRate: number;
  readonly qualityScore: number;
  readonly measuredDimensions: readonly string[];
  readonly unmeasuredDimensions: readonly string[];
  readonly artifactQualityScore?: number;
  readonly runtimeQualityScore?: number;
  readonly accessibilityScore?: number;
  readonly performanceScore?: number;
  readonly latencyMsMean: number;
  readonly costMean?: number | null;
  readonly reliabilityStatus: string;
  readonly operationalFailureRate: number;
  readonly failureCategories: Readonly<Record<string, number>>;
  readonly sampleCount: number;
  readonly validComparisonSamples: number;
  readonly evidenceTier: string;
  readonly confidence: PerformanceFingerprint["confidence"];
  readonly coverageRatio: number;
  readonly variance: number;
  readonly recencyDays?: number;
};

export type RoutingReadinessScopeReport = {
  readonly scope: string;
  readonly service?: string;
  readonly subtype?: string;
  readonly status: RoutingReadinessStatus;
  readonly evidenceSufficiency: string;
  readonly compatibleSampleCount: number;
  readonly confidence: PerformanceFingerprint["confidence"];
  readonly qualityAdvantage?: number;
  readonly contractAdvantage?: number;
  readonly reliabilityDifference?: number;
  readonly latencyDifference?: number;
  readonly costDifference?: number | null;
  readonly dominantFailures: readonly string[];
  readonly specializationStatus: string;
  readonly regressionStatus: string;
  readonly promotionReadiness: string;
  readonly breakdowns: readonly ModelServicePerformanceBreakdown[];
  readonly comparisons: readonly ModelComparisonResult[];
  readonly specializations: readonly SpecializationCandidate[];
  readonly reasons: readonly string[];
};

export type RoutingReadinessReport = {
  readonly overallStatus: RoutingReadinessStatus;
  readonly adaptiveRoutingActivated: false;
  readonly controlledRecordCount: number;
  readonly validComparisonCount: number;
  readonly productionRecordCountExcluded: number;
  readonly scopes: readonly RoutingReadinessScopeReport[];
  readonly notAutomatedDimensions: readonly string[];
  readonly textReport: string;
};

function variance(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
}

function dominantFailures(records: readonly ModelPerformanceRecord[]): readonly string[] {
  const counts = new Map<string, number>();
  for (const r of records) {
    for (const cat of r.failureCategories ?? []) {
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    if (r.benchmarkOutcome !== "MODEL_SUCCESS") {
      counts.set(r.benchmarkOutcome, (counts.get(r.benchmarkOutcome) ?? 0) + 1);
    }
  }
  return Object.freeze(
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k, v]) => `${k}(${v})`),
  );
}

function breakdownFromFingerprint(
  fp: PerformanceFingerprint,
  records: readonly ModelPerformanceRecord[],
): ModelServicePerformanceBreakdown {
  const scoped = records.filter(
    (r) => r.providerId === fp.providerId && r.modelId === fp.modelId && r.service === fp.service,
  );
  const qualityScores = scoped.map((r) => r.qualityScore);
  return Object.freeze({
    providerId: fp.providerId,
    modelId: fp.modelId,
    service: fp.service,
    subtype: fp.subtype,
    contractCompliancePercent: Math.round(fp.hardRequirementPassRateMean * 100),
    hardRequirementPassRate: fp.hardRequirementPassRateMean,
    qualityScore: Math.round(fp.qualityScoreMean),
    measuredDimensions: fp.measuredQualityDimensions,
    unmeasuredDimensions: fp.unmeasuredQualityDimensions,
    latencyMsMean: Math.round(fp.latencyMsMean),
    costMean: fp.costMean,
    reliabilityStatus:
      fp.operationalFailureRate > 0.25 ? "degraded" : fp.operationalFailureRate > 0 ? "mixed" : "stable",
    operationalFailureRate: fp.operationalFailureRate,
    failureCategories: fp.failureCategories,
    sampleCount: fp.sampleCount,
    validComparisonSamples: fp.validComparisonSamples,
    evidenceTier: resolveEvidenceTier(fp.validComparisonSamples),
    confidence: fp.confidence,
    coverageRatio: fp.sampleCount > 0 ? fp.validComparisonSamples / fp.sampleCount : 0,
    variance: variance(qualityScores),
  });
}

function resolveScopeStatus(input: {
  readonly validCount: number;
  readonly comparisons: readonly ModelComparisonResult[];
  readonly specializations: readonly SpecializationCandidate[];
  readonly fingerprints: readonly PerformanceFingerprint[];
}): RoutingReadinessStatus {
  if (input.validCount < DEFAULT_EVIDENCE_TIER_THRESHOLDS.insufficientBelow) {
    return "INSUFFICIENT_EVIDENCE";
  }
  if (input.comparisons.some((c) => c.status === "INCOMPATIBLE")) {
    return "INCOMPARABLE";
  }
  if (input.comparisons.every((c) => c.status === "INSUFFICIENT_EVIDENCE")) {
    return "INSUFFICIENT_EVIDENCE";
  }

  const operationalRisk = input.fingerprints.some((fp) => fp.operationalFailureRate > 0.4);
  if (operationalRisk) return "RELIABILITY_RISK";

  const capabilityRisk = input.fingerprints.some((fp) =>
    Object.keys(fp.failureCategories).some((k) =>
      ["EXECUTION_CAPABILITY_UNAVAILABLE", "VALIDATION_UNAVAILABLE", "CONTRACT_FAILURE"].includes(k),
    ),
  );
  if (capabilityRisk) return "CAPABILITY_RISK";

  const bestComparison = input.comparisons.find((c) => c.status === "COMPARABLE");
  if (bestComparison?.latencyDelta != null && bestComparison.latencyDelta > 500) {
    return "LATENCY_RISK";
  }
  if (bestComparison?.costDelta != null && bestComparison.costDelta > 0.05) {
    return "COST_RISK";
  }

  const hasSpecialization = input.specializations.some((s) => s.status === "SPECIALIZATION");
  const sufficient = input.validCount >= DEFAULT_EVIDENCE_TIER_THRESHOLDS.moderateMin;
  if (hasSpecialization && sufficient) {
    return "READY_FOR_HUMAN_REVIEW";
  }

  if (input.validCount >= DEFAULT_EVIDENCE_TIER_THRESHOLDS.lowMin) {
    return "NOT_READY";
  }

  return "INSUFFICIENT_EVIDENCE";
}

export function buildRoutingReadinessReport(input: {
  readonly records: readonly ModelPerformanceRecord[];
  readonly organizationId?: string;
}): RoutingReadinessReport {
  const productionExcluded = filterObservationalProductionRecords(input.records);
  const valid = filterValidComparisonRecords(input.records);
  const separated = separateEvidenceQuality(input.records);
  const fingerprints = aggregateRecordsInMemory(valid);

  const services = [...new Set(valid.map((r) => r.service))];
  const scopes: RoutingReadinessScopeReport[] = [];

  for (const service of services) {
    const serviceRecords = valid.filter((r) => r.service === service);
    const serviceFps = fingerprints.filter((fp) => fp.service === service);
    const comparisons = compareModelsAtScope({ records: serviceRecords });
    const specializations = detectSpecializations({ fingerprints: serviceFps });
    const status = resolveScopeStatus({
      validCount: serviceRecords.length,
      comparisons,
      specializations,
      fingerprints: serviceFps,
    });

    const breakdowns = serviceFps.map((fp) => breakdownFromFingerprint(fp, serviceRecords));
    const dominant = dominantFailures(serviceRecords);

    const mockRec: OptimizationRecommendation = Object.freeze({
      recommendationStatus:
        serviceRecords.length >= DEFAULT_EVIDENCE_TIER_THRESHOLDS.insufficientBelow
          ? "RECOMMENDATION"
          : "INSUFFICIENT_EVIDENCE",
      scope: service,
      candidateLabel: serviceRecords[0]?.modelId ?? "unknown",
      candidate: Object.freeze({
        providerId: serviceRecords[0]?.providerId,
        modelId: serviceRecords[0]?.modelId,
      }),
      evidenceCount: serviceRecords.length,
      validComparisonSamples: serviceRecords.length,
      confidence: serviceFps[0]?.confidence.level ?? "insufficient",
      evidenceTier: resolveEvidenceTier(serviceRecords.length),
      observedAdvantage:
        comparisons.find((c) => c.qualityDelta != null)?.qualityDelta ?? undefined,
      conditions: Object.freeze([]),
      versions: Object.freeze({}),
      limitations: Object.freeze([]),
      comparisonCompatibility: comparisons.some((c) => c.status === "INCOMPATIBLE")
        ? "INCOMPARABLE"
        : "COMPARABLE",
    });

    const promotionStatus = assessPromotionReadiness({
      recommendation: mockRec,
      actual: Object.freeze({
        providerId: serviceRecords[0]?.providerId ?? "unknown",
        modelId: serviceRecords[0]?.modelId ?? "unknown",
      }),
    });

    scopes.push(
      Object.freeze({
        scope: service,
        service,
        status,
        evidenceSufficiency: resolveEvidenceTier(serviceRecords.length),
        compatibleSampleCount: serviceRecords.length,
        confidence: serviceFps[0]?.confidence ?? Object.freeze({ level: "insufficient", score: 0 }),
        qualityAdvantage: comparisons.find((c) => c.qualityDelta != null)?.qualityDelta,
        contractAdvantage: comparisons.find((c) => c.hardComplianceDelta != null)?.hardComplianceDelta,
        reliabilityDifference: undefined,
        latencyDifference: comparisons.find((c) => c.latencyDelta != null)?.latencyDelta,
        costDifference: comparisons.find((c) => c.costDelta != null)?.costDelta ?? null,
        dominantFailures: dominant,
        specializationStatus:
          specializations.find((s) => s.status === "SPECIALIZATION")?.status ??
          specializations[0]?.status ??
          "INSUFFICIENT_EVIDENCE",
        regressionStatus: "NOT_EVALUATED",
        promotionReadiness: promotionStatus,
        breakdowns: Object.freeze(breakdowns),
        comparisons: Object.freeze(comparisons),
        specializations: Object.freeze(specializations),
        reasons: Object.freeze([
          `${serviceRecords.length} valid controlled comparison sample(s)`,
          ...comparisons.flatMap((c) => c.reason ?? []),
        ]),
      }),
    );
  }

  const notAutomated = [
    ...new Set(fingerprints.flatMap((fp) => fp.unmeasuredQualityDimensions)),
  ];

  const overallStatus: RoutingReadinessStatus =
    scopes.length === 0
      ? "INSUFFICIENT_EVIDENCE"
      : scopes.every((s) => s.status === "INSUFFICIENT_EVIDENCE")
        ? "INSUFFICIENT_EVIDENCE"
        : scopes.some((s) => s.status === "READY_FOR_HUMAN_REVIEW")
          ? "READY_FOR_HUMAN_REVIEW"
          : scopes[0]!.status;

  const textReport = formatRoutingReadinessReport({
    overallStatus,
    scopes,
    controlledRecordCount: separated.validComparison.length + separated.other.length,
    validComparisonCount: valid.length,
    productionRecordCountExcluded: productionExcluded.length,
    notAutomatedDimensions: notAutomated,
  });

  return Object.freeze({
    overallStatus,
    adaptiveRoutingActivated: false,
    controlledRecordCount: input.records.length - productionExcluded.length,
    validComparisonCount: valid.length,
    productionRecordCountExcluded: productionExcluded.length,
    scopes: Object.freeze(scopes),
    notAutomatedDimensions: Object.freeze(notAutomated),
    textReport,
  });
}

export function formatRoutingReadinessReport(input: {
  readonly overallStatus: RoutingReadinessStatus;
  readonly scopes: readonly RoutingReadinessScopeReport[];
  readonly controlledRecordCount: number;
  readonly validComparisonCount: number;
  readonly productionRecordCountExcluded: number;
  readonly notAutomatedDimensions: readonly string[];
}): string {
  const lines = [
    "=== Routing Readiness Report (Step 15) ===",
    `Overall status: ${input.overallStatus}`,
    `Adaptive routing activated: NO`,
    `Controlled records: ${input.controlledRecordCount}`,
    `Valid comparison samples: ${input.validComparisonCount}`,
    `Production observational records excluded: ${input.productionRecordCountExcluded}`,
    "",
    "Per-service scope:",
  ];

  for (const scope of input.scopes) {
    lines.push(`\n--- ${scope.scope} ---`);
    lines.push(`Status: ${scope.status}`);
    lines.push(`Evidence tier: ${scope.evidenceSufficiency}`);
    lines.push(`Compatible samples: ${scope.compatibleSampleCount}`);
    lines.push(`Confidence: ${scope.confidence.level}`);
    lines.push(`Specialization: ${scope.specializationStatus}`);
    lines.push(`Promotion readiness: ${scope.promotionReadiness}`);
    if (scope.dominantFailures.length > 0) {
      lines.push(`Dominant failures: ${scope.dominantFailures.join(", ")}`);
    }
    for (const b of scope.breakdowns) {
      lines.push(
        `  ${b.modelId}: quality=${b.qualityScore} hard=${(b.hardRequirementPassRate * 100).toFixed(0)}% ` +
          `latency=${b.latencyMsMean}ms tier=${b.evidenceTier} samples=${b.validComparisonSamples}`,
      );
      if (b.unmeasuredDimensions.length > 0) {
        lines.push(`    unmeasured: ${b.unmeasuredDimensions.join(", ")}`);
      }
    }
  }

  if (input.notAutomatedDimensions.length > 0) {
    lines.push("\nNOT_AUTOMATED dimensions (aggregate):");
    lines.push(`  ${input.notAutomatedDimensions.join(", ")}`);
  }

  lines.push("\nNOTE: READY_FOR_HUMAN_REVIEW does NOT activate adaptive routing.");

  return lines.join("\n");
}

export function buildPerformanceBreakdownReports(
  records: readonly ModelPerformanceRecord[],
): readonly ReturnType<typeof buildPerformanceIntelligenceReport>[] {
  const valid = filterValidComparisonRecords(records);
  const fingerprints = aggregateRecordsInMemory(valid);
  return Object.freeze(fingerprints.map((fp) => buildPerformanceIntelligenceReport(fp)));
}
