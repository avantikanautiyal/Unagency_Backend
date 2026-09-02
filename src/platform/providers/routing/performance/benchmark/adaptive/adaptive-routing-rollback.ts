/**
 * Step 13 — Automatic policy pause on regression (scope-local, durable rollback events).
 */

import type { ModelPerformanceRecord } from "../contracts/model-performance-record";
import type { AdaptiveRoutingPolicy } from "./routing-policy-contract";
import type { IRoutingPolicyStore } from "./routing-policy-store";
import { defaultRoutingPolicyStore } from "./routing-policy-store";
import { createRoutingPolicyService } from "./routing-policy-service";
import type { IAdaptiveRollbackStore } from "./adaptive-rollback-store";
import { defaultAdaptiveRollbackStore } from "./adaptive-rollback-store";
import { logAdaptiveMetric } from "./adaptive-routing-logger";

export type AdaptiveRollbackThresholds = {
  readonly maxQualityRegression: number;
  readonly maxReliabilityRegression: number;
  readonly maxCostIncreaseRatio: number;
  readonly maxLatencyIncreaseRatio: number;
  readonly minSamples: number;
};

export const DEFAULT_ADAPTIVE_ROLLBACK_THRESHOLDS: AdaptiveRollbackThresholds = Object.freeze({
  maxQualityRegression: 8,
  maxReliabilityRegression: 0.2,
  maxCostIncreaseRatio: 1.4,
  maxLatencyIncreaseRatio: 1.5,
  minSamples: 3,
});

export type AdaptivePerformanceSlice = {
  readonly adaptiveQualityMean: number;
  readonly staticQualityMean: number;
  readonly adaptiveFailureRate: number;
  readonly staticFailureRate: number;
  readonly adaptiveCostMean?: number | null;
  readonly staticCostMean?: number | null;
  readonly adaptiveLatencyMean: number;
  readonly staticLatencyMean: number;
  readonly adaptiveSamples: number;
  readonly staticSamples: number;
};

export function sliceAdaptiveVsStatic(
  records: readonly ModelPerformanceRecord[],
): AdaptivePerformanceSlice {
  const adaptive = records.filter((r) => r.routingMode === "adaptive");
  const staticRecords = records.filter((r) => r.routingMode === "static" || !r.routingMode);
  const mean = (vals: number[]) =>
    vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  const failRate = (rows: ModelPerformanceRecord[]) =>
    rows.length
      ? rows.filter((r) => r.reliabilityStatus === "operational_failure").length / rows.length
      : 0;

  return Object.freeze({
    adaptiveQualityMean: mean(adaptive.map((r) => r.qualityScore)),
    staticQualityMean: mean(staticRecords.map((r) => r.qualityScore)),
    adaptiveFailureRate: failRate(adaptive),
    staticFailureRate: failRate(staticRecords),
    adaptiveCostMean: mean(
      adaptive.filter((r) => r.estimatedCost != null).map((r) => r.estimatedCost as number),
    ),
    staticCostMean: mean(
      staticRecords.filter((r) => r.estimatedCost != null).map((r) => r.estimatedCost as number),
    ),
    adaptiveLatencyMean: mean(adaptive.map((r) => r.latencyMs)),
    staticLatencyMean: mean(staticRecords.map((r) => r.latencyMs)),
    adaptiveSamples: adaptive.length,
    staticSamples: staticRecords.length,
  });
}

export function detectAdaptiveRegression(
  slice: AdaptivePerformanceSlice,
  thresholds: AdaptiveRollbackThresholds = DEFAULT_ADAPTIVE_ROLLBACK_THRESHOLDS,
): readonly string[] {
  if (slice.adaptiveSamples < thresholds.minSamples) return Object.freeze([]);
  const reasons: string[] = [];
  if (
    slice.staticQualityMean - slice.adaptiveQualityMean >
    thresholds.maxQualityRegression
  ) {
    reasons.push("quality regression beyond threshold");
  }
  if (
    slice.adaptiveFailureRate - slice.staticFailureRate >
    thresholds.maxReliabilityRegression
  ) {
    reasons.push("reliability regression beyond threshold");
  }
  if (
    slice.adaptiveCostMean != null &&
    slice.staticCostMean != null &&
    slice.staticCostMean > 0 &&
    slice.adaptiveCostMean > slice.staticCostMean * thresholds.maxCostIncreaseRatio
  ) {
    reasons.push("cost regression beyond threshold");
  }
  if (
    slice.staticLatencyMean > 0 &&
    slice.adaptiveLatencyMean > slice.staticLatencyMean * thresholds.maxLatencyIncreaseRatio
  ) {
    reasons.push("latency regression beyond threshold");
  }
  return Object.freeze(reasons);
}

export async function pausePolicyOnRegression(input: {
  readonly policy: AdaptiveRoutingPolicy;
  readonly records: readonly ModelPerformanceRecord[];
  readonly nowIso: () => string;
  readonly createId: (prefix: string) => string;
  readonly policyStore?: IRoutingPolicyStore;
  readonly rollbackStore?: IAdaptiveRollbackStore;
  readonly thresholds?: AdaptiveRollbackThresholds;
}): Promise<{ readonly paused: boolean; readonly reasons: readonly string[] }> {
  const slice = sliceAdaptiveVsStatic(input.records);
  const reasons = detectAdaptiveRegression(slice, input.thresholds);
  if (reasons.length === 0) return Object.freeze({ paused: false, reasons });

  const policyStore = input.policyStore ?? defaultRoutingPolicyStore;
  const rollbackStore = input.rollbackStore ?? defaultAdaptiveRollbackStore;
  const service = createRoutingPolicyService({ store: policyStore });
  await service.pausePolicy({
    policyId: input.policy.policyId,
    reason: reasons.join("; "),
    nowIso: input.nowIso,
  });

  await rollbackStore.append(
    Object.freeze({
      rollbackId: input.createId("rollback"),
      policyId: input.policy.policyId,
      policyVersion: input.policy.policyVersion,
      reason: reasons.join("; "),
      timestamp: input.nowIso(),
      scope: Object.freeze({ ...input.policy.scope }),
      metrics: Object.freeze({
        adaptiveQualityMean: slice.adaptiveQualityMean,
        staticQualityMean: slice.staticQualityMean,
        adaptiveFailureRate: slice.adaptiveFailureRate,
        staticFailureRate: slice.staticFailureRate,
        adaptiveCostMean: slice.adaptiveCostMean ?? undefined,
        staticCostMean: slice.staticCostMean ?? undefined,
        adaptiveLatencyMean: slice.adaptiveLatencyMean,
        staticLatencyMean: slice.staticLatencyMean,
      }),
    }),
  );

  logAdaptiveMetric("adaptive_rollback", {
    policyId: input.policy.policyId,
    policyVersion: input.policy.policyVersion,
    reason: reasons.join("; "),
  });

  return Object.freeze({ paused: true, reasons });
}
