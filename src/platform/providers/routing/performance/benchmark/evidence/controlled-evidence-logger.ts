/**
 * Step 15 — Structured logging for controlled evidence collection.
 */

import type { BenchmarkCase, BenchmarkModelTarget } from "../contracts/benchmark-case";
import type { ModelPerformanceRecord } from "../contracts/model-performance-record";
import type { ControlledEvidencePlan } from "./controlled-evidence-expansion";

export const EVIDENCE_COLLECTION_PREFIX = "[UNAGENCY-EVIDENCE-COLLECTION]" as const;

export type EvidenceCellLogInput = {
  readonly benchmarkId: string;
  readonly benchmarkCase: BenchmarkCase;
  readonly model: BenchmarkModelTarget;
  readonly repeatIndex: number;
  readonly record: ModelPerformanceRecord;
  readonly contractStatus?: string;
  readonly measuredDimensions?: readonly string[];
  readonly unmeasuredDimensions?: readonly string[];
  readonly evidenceStatus?: string;
};

function safeFields(fields: Record<string, unknown>): Record<string, unknown> {
  const blocked = new Set(["apiKey", "api_key", "token", "password", "prompt", "brief"]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (blocked.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

export function logEvidenceCollectionBanner(input: {
  readonly tier: number;
  readonly models: readonly BenchmarkModelTarget[];
  readonly benchmarkIds: readonly string[];
  readonly repeats: number;
  readonly maxApiCalls: number;
  readonly estimatedCostUsd?: number | null;
  readonly adaptiveRoutingEnabled: boolean;
  readonly concurrency: number;
}): void {
  console.log(`\n${EVIDENCE_COLLECTION_PREFIX} CONTROLLED EVIDENCE COLLECTION`);
  console.log(`${EVIDENCE_COLLECTION_PREFIX} Tier: ${input.tier}`);
  console.log(`${EVIDENCE_COLLECTION_PREFIX} Models: ${input.models.length}`);
  console.log(`${EVIDENCE_COLLECTION_PREFIX} Services: ${new Set(input.benchmarkIds.map((id) => id.split(".")[1])).size}`);
  console.log(`${EVIDENCE_COLLECTION_PREFIX} Benchmarks: ${input.benchmarkIds.length}`);
  console.log(`${EVIDENCE_COLLECTION_PREFIX} Repeats: ${input.repeats}`);
  console.log(`${EVIDENCE_COLLECTION_PREFIX} Maximum API calls: ${input.maxApiCalls}`);
  console.log(
    `${EVIDENCE_COLLECTION_PREFIX} Estimated cost: ${
      input.estimatedCostUsd != null ? `$${input.estimatedCostUsd.toFixed(4)}` : "unavailable"
    }`,
  );
  console.log(`${EVIDENCE_COLLECTION_PREFIX} Concurrency: ${input.concurrency}`);
  console.log(
    `${EVIDENCE_COLLECTION_PREFIX} Adaptive routing: ${input.adaptiveRoutingEnabled ? "ON" : "OFF"}`,
  );
}

export function logEvidenceDryRunPlan(plan: ControlledEvidencePlan): void {
  console.log(`\n${EVIDENCE_COLLECTION_PREFIX} DRY-RUN PLAN`);
  for (const line of plan.summary) {
    console.log(`${EVIDENCE_COLLECTION_PREFIX} ${line}`);
  }
  console.log(`${EVIDENCE_COLLECTION_PREFIX} Total invocations: ${plan.totalInvocations}`);
  console.log(`${EVIDENCE_COLLECTION_PREFIX} ZERO provider calls in dry-run mode`);
}

export function logEvidenceCellResult(input: EvidenceCellLogInput): void {
  const payload = safeFields({
    event: "evidence.cell.completed",
    benchmark: input.benchmarkId,
    service: input.benchmarkCase.service,
    subtype: input.benchmarkCase.subtype,
    model: input.model.modelId,
    provider: input.model.providerId,
    repeat: input.repeatIndex + 1,
    outcome: input.record.benchmarkOutcome,
    contractStatus: input.contractStatus ?? input.record.contractValidationStatus,
    quality: input.record.qualityScore,
    hardCompliance: `${(input.record.hardRequirementPassRate * 100).toFixed(0)}%`,
    latencyMs: input.record.latencyMs,
    cost:
      input.record.costAvailable && input.record.estimatedCost != null
        ? input.record.estimatedCost
        : null,
    measuredDimensions: input.measuredDimensions ?? input.record.measuredQualityDimensions,
    unmeasuredDimensions: input.unmeasuredDimensions ?? input.record.unmeasuredQualityDimensions,
    evidenceStatus: input.evidenceStatus ?? input.record.evidenceMode,
    reliability: input.record.reliabilityStatus,
    failureCategories: input.record.failureCategories,
    performanceRecordId: input.record.performanceRecordId,
  });
  console.log(`${EVIDENCE_COLLECTION_PREFIX} ${JSON.stringify(payload)}`);
}

export function logEvidenceCollectionComplete(input: {
  readonly plannedCalls: number;
  readonly executedCalls: number;
  readonly recordsGenerated: number;
  readonly totalCostUsd?: number;
  readonly adaptiveRoutingEnabled: boolean;
}): void {
  console.log(`\n${EVIDENCE_COLLECTION_PREFIX} COLLECTION COMPLETE`);
  console.log(`${EVIDENCE_COLLECTION_PREFIX} Planned calls: ${input.plannedCalls}`);
  console.log(`${EVIDENCE_COLLECTION_PREFIX} Executed calls: ${input.executedCalls}`);
  console.log(`${EVIDENCE_COLLECTION_PREFIX} Records generated: ${input.recordsGenerated}`);
  console.log(
    `${EVIDENCE_COLLECTION_PREFIX} Total cost: ${
      input.totalCostUsd != null ? `$${input.totalCostUsd.toFixed(4)}` : "unavailable"
    }`,
  );
  console.log(
    `${EVIDENCE_COLLECTION_PREFIX} Adaptive routing remained: ${input.adaptiveRoutingEnabled ? "ON" : "OFF"}`,
  );
}
