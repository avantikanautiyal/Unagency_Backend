/**
 * Result aggregator.
 *
 * Purpose: Combine one or more execution results into a single orchestration response.
 * Responsibilities: Support single-result and future multi-step/parallel aggregation.
 * Usage: After runtime completes.
 * Future Extension: Weighted merge, partial success policies.
 */

import type { ExecutionResult } from "../../execution-runtime/contracts/execution-result";
import type { ExecutionSnapshot } from "../../execution-runtime/contracts/execution-snapshot";
import type { ExecutionMetrics } from "../../execution-runtime/contracts/execution-metrics";
import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type {
  OrchestrationResult,
  OrchestrationStatus,
} from "../contracts/orchestration-result";

export interface AggregationInput {
  readonly orchestrationId: string;
  readonly planId: string;
  readonly contributions: readonly ExecutionResult[];
  readonly snapshot?: ExecutionSnapshot;
  readonly metrics?: ExecutionMetrics;
  readonly completedAt: string;
}

export interface IResultAggregator {
  aggregate(input: AggregationInput): Result<OrchestrationResult>;
}

export class ResultAggregator implements IResultAggregator {
  aggregate(input: AggregationInput): Result<OrchestrationResult> {
    const contributions = input.contributions;
    const status = deriveStatus(contributions);
    const aggregated =
      contributions.length === 1
        ? contributions[0]
        : mergeContributions(contributions, input.completedAt);

    return success({
      orchestrationId: input.orchestrationId,
      planId: input.planId,
      status,
      sessionId: aggregated?.sessionId ?? contributions[0]?.sessionId,
      aggregated,
      contributions,
      snapshot: input.snapshot,
      metrics: input.metrics,
      message: aggregated?.message,
      completedAt: input.completedAt,
    });
  }
}

function deriveStatus(
  contributions: readonly ExecutionResult[]
): OrchestrationStatus {
  if (contributions.length === 0) {
    return "failed";
  }
  const allSuccess = contributions.every((c) => c.success);
  const allFailed = contributions.every((c) => !c.success);
  const anyCancelled = contributions.some((c) => c.state === "cancelled");

  if (allSuccess) return "completed";
  if (anyCancelled && !allSuccess) return "cancelled";
  if (allFailed) return "failed";
  return "partial";
}

function mergeContributions(
  contributions: readonly ExecutionResult[],
  completedAt: string
): ExecutionResult {
  const successCount = contributions.filter((c) => c.success).length;
  return {
    sessionId: contributions.map((c) => c.sessionId).join(","),
    state: successCount === contributions.length ? "completed" : "failed",
    success: successCount === contributions.length,
    message: `aggregated_${contributions.length}_results`,
    output: {
      results: contributions.map((c) => c.output ?? {}),
      successCount,
      total: contributions.length,
    },
    completedAt,
  };
}
