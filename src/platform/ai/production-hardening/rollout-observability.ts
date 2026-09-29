/**
 * Phase 20 — Safe rollout decision observability (existing execution-trace).
 */

import { recordExecutionTraceStage } from "../../os/observability/execution-trace";
import type { CanonicalEligibilityDecision } from "./eligibility";

export function emitCanonicalRolloutDecisionTrace(
  decision: CanonicalEligibilityDecision,
  executionId?: string,
): void {
  const id = executionId?.trim();
  if (!id) return;
  recordExecutionTraceStage({
    executionId: id,
    stage: "canonical_rollout",
    status: decision.eligible ? "COMPLETED" : "SKIPPED",
    skipReason: decision.eligible ? undefined : decision.denyReason,
    details: {
      path: decision.path,
      eligible: decision.eligible,
      stage: decision.stage,
      generationFlag: decision.generationFlag,
      repairFlag: decision.repairFlag,
      reason: decision.reason,
      denyReason: decision.denyReason,
      serviceId: decision.serviceId,
      organizationIdPresent: Boolean(decision.organizationId),
      projectIdPresent: Boolean(decision.projectId),
      failClosed: decision.failClosed,
      sensitiveBodiesOmitted: true,
    },
  });
}
