/**
 * Step 12 — Adaptive routing structured logging.
 */

import type { AdaptiveRoutingDecision } from "./adaptive-routing-decision-contract";

export function logAdaptiveRoutingEnabled(enabled: boolean): void {
  console.log(`[UNAGENCY-ADAPTIVE-ROUTING] global switch | enabled=${enabled}`);
}

export function logAdaptiveRoutingDecision(decision: AdaptiveRoutingDecision): void {
  console.log(
    [
      "[UNAGENCY-ADAPTIVE-DECISION]",
      `request=${decision.requestId}`,
      decision.executionId ? `execution=${decision.executionId}` : null,
      `scope=${decision.scope.service}${decision.scope.subtype ? `/${decision.scope.subtype}` : ""}`,
      decision.scope.industry ? `industry=${decision.scope.industry}` : null,
      `actual=${decision.actual.providerId}/${decision.actual.modelId}`,
      decision.adaptive
        ? `adaptive=${decision.adaptive.providerId}/${decision.adaptive.modelId}`
        : "adaptive=none",
      `decision=${decision.decision}`,
      `reason=${decision.reason}`,
      `mode=${decision.routingMode}`,
      `confidence=${decision.evidence.confidence}`,
      `samples=${decision.evidence.validComparisonSamples}`,
      decision.rolloutSelected != null ? `rollout=${decision.rolloutSelected}` : null,
      decision.provenance.routingPolicyId
        ? `policy=${decision.provenance.routingPolicyId}@${decision.provenance.routingPolicyVersion}`
        : null,
    ]
      .filter(Boolean)
      .join(" | "),
  );
}

export function logAdaptiveRoutingExecution(input: {
  readonly executionId: string;
  readonly adaptiveSelected: boolean;
  readonly adaptiveExecutionSucceeded?: boolean;
  readonly adaptiveExecutionFailed?: boolean;
  readonly fallbackUsed?: boolean;
  readonly fallbackReason?: string;
  readonly initialAdaptiveProviderId?: string;
  readonly initialAdaptiveModelId?: string;
  readonly finalProviderId?: string;
  readonly finalModelId?: string;
  readonly correlationId?: string;
}): void {
  console.log(
    [
      "[UNAGENCY-ADAPTIVE-EXECUTION]",
      input.correlationId ? `correlation=${input.correlationId}` : null,
      `execution=${input.executionId}`,
      `adaptiveSelected=${input.adaptiveSelected}`,
      input.adaptiveExecutionSucceeded != null
        ? `adaptiveSuccess=${input.adaptiveExecutionSucceeded}`
        : null,
      input.adaptiveExecutionFailed != null
        ? `adaptiveFailed=${input.adaptiveExecutionFailed}`
        : null,
      input.fallbackUsed != null ? `fallbackUsed=${input.fallbackUsed}` : null,
      input.fallbackReason ? `fallbackReason=${input.fallbackReason}` : null,
      input.initialAdaptiveProviderId && input.initialAdaptiveModelId
        ? `initial=${input.initialAdaptiveProviderId}/${input.initialAdaptiveModelId}`
        : null,
      input.finalProviderId && input.finalModelId
        ? `final=${input.finalProviderId}/${input.finalModelId}`
        : null,
    ]
      .filter(Boolean)
      .join(" | "),
  );
}

export function logAdaptiveMetric(
  metric:
    | "adaptive_considered"
    | "adaptive_selected"
    | "adaptive_rejected"
    | "capability_mismatch"
    | "insufficient_evidence"
    | "guardrail_failure"
    | "invalid_policy"
    | "adaptive_execution_success"
    | "adaptive_execution_failure"
    | "adaptive_fallback"
    | "adaptive_rollback",
  fields: Readonly<Record<string, string | number | boolean | undefined>>,
): void {
  const parts = Object.entries(fields)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k}=${String(v)}`);
  console.log(`[UNAGENCY-ADAPTIVE-ROUTING] metric=${metric}${parts.length ? ` | ${parts.join(" | ")}` : ""}`);
}
