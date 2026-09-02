/**
 * Bridge benchmark records to existing IModelPerformanceStore.
 */

import type { IModelPerformanceStore } from "../../interfaces/model-performance-store";
import type { PerformanceEvidence } from "../../contracts/performance-evidence";
import type { ModelPerformanceRecord } from "../contracts/model-performance-record";

function evaluationTrustForRecord(
  record: ModelPerformanceRecord,
): PerformanceEvidence["evaluationTrust"] {
  if (record.unmeasuredQualityDimensions.length === 0) return "high";
  if (record.measuredQualityDimensions.length > 0) return "medium";
  return "low";
}

export function toPerformanceEvidence(
  record: ModelPerformanceRecord,
): PerformanceEvidence {
  const success = record.reliabilityStatus === "success";
  return Object.freeze({
    evidenceId: record.performanceRecordId,
    executionId: record.executionId,
    attemptId: record.attemptId ?? record.performanceRecordId,
    organizationId: record.organizationId,
    capabilityId: record.capabilityId,
    providerId: record.providerId,
    modelId: record.modelId,
    positionInRoute: 0,
    primaryOrFailover: "primary" as const,
    exploratory: true,
    startedAt: record.recordedAt,
    completedAt: record.recordedAt,
    latencyMs: record.latencyMs,
    success,
    failureCategory: record.operationalFailureCategory ?? (success ? "none" : "unknown"),
    evaluationScore: record.qualityScore,
    evaluationDimensions: record.qualityDimensions,
    feedbackEligible: record.measuredQualityDimensions.length > 0,
    evaluationTrust: evaluationTrustForRecord(record),
    evaluationMethod: "benchmark" as const,
    evaluationStatus:
      record.unmeasuredQualityDimensions.length > 0
        ? ("partially_evaluated" as const)
        : ("evaluated" as const),
    judgeId: record.evaluatorId,
    judgeVersion: record.evaluatorVersion,
    rubricVersion: record.validationVersion,
    evaluationMetricNamespace: "QUALITY",
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    totalTokens: record.totalTokens,
    estimatedCost: record.costAvailable ? record.estimatedCost : null,
    costEligible: record.costAvailable,
    costStatus: record.costAvailable ? ("calculated" as const) : ("unknown" as const),
    costMethod: record.costAvailable ? ("pricing_catalogue" as const) : ("none" as const),
    retryCount: record.repairCount,
    timeoutOccurred: record.operationalFailureCategory === "timeout",
    rateLimited: record.operationalFailureCategory === "rate_limit",
    recordedAt: record.recordedAt,
  });
}

export async function persistBenchmarkToPerformanceStore(
  store: IModelPerformanceStore,
  record: ModelPerformanceRecord,
): Promise<void> {
  const evidence = toPerformanceEvidence(record);
  await store.recordIdempotent(evidence);
  if (
    record.measuredQualityDimensions.length > 0 ||
    record.hardRequirementsTotal > 0
  ) {
    await store.attachEvaluation(
      evidence.attemptId,
      record.measuredQualityDimensions.length > 0 ? record.qualityScore : null,
      record.qualityDimensions,
      {
        feedbackEligible: record.measuredQualityDimensions.length > 0,
        evaluationMethod: "benchmark",
        evaluationStatus:
          record.unmeasuredQualityDimensions.length > 0
            ? "partially_evaluated"
            : "evaluated",
        judgeId: record.evaluatorId,
        judgeVersion: record.evaluatorVersion,
        rubricVersion: record.validationVersion,
        evaluationMetricNamespace: "QUALITY",
        evaluationTrust: evaluationTrustForRecord(record),
      },
    );
  }
}
