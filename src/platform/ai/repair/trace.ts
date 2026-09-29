/**
 * Phase 17 — Safe repair observability (existing execution-trace).
 */

import { recordExecutionTraceStage } from "../../os/observability/execution-trace";
import type { CanonicalRepairResult } from "./types";

export function emitRepairTrace(result: CanonicalRepairResult): void {
  const executionId =
    result.finalExecutionResult?.executionId ??
    result.originalExecutionId;
  if (!executionId) return;
  recordExecutionTraceStage({
    executionId,
    stage: "automatic_repair",
    status:
      result.status === "REPAIRED"
        ? "COMPLETED"
        : result.status === "DISABLED" || result.status === "NOT_ELIGIBLE"
          ? "SKIPPED"
          : "FAILED",
    error: result.code,
    details: {
      actionId: result.actionId,
      actionVersion: result.actionVersion,
      originalExecutionId: result.originalExecutionId,
      status: result.status,
      strategy: result.plan.strategy,
      attempt: result.plan.attempt,
      maxAttempts: result.plan.maxAttempts,
      originalQaCodes: result.plan.originalQaCodes,
      finalQaStatus: result.finalQa?.status,
      attemptCount: result.attempts.length,
      autoRepaired: result.status === "REPAIRED",
    },
  });
}
