/**
 * Step 13 — Adaptive routing telemetry helpers (no secrets/user content).
 */

import type {
  AdaptiveRoutingDecision,
  AdaptiveRoutingTelemetry,
} from "./adaptive-routing-decision-contract";
import {
  logAdaptiveMetric,
  logAdaptiveRoutingDecision,
} from "./adaptive-routing-logger";

export function buildAdaptiveTelemetry(input: {
  readonly event: AdaptiveRoutingTelemetry["event"];
  readonly staticProviderId?: string;
  readonly staticModelId?: string;
  readonly selectedProviderId?: string;
  readonly selectedModelId?: string;
  readonly capabilityPass?: boolean;
  readonly capabilityReasons?: readonly string[];
}): AdaptiveRoutingTelemetry {
  return Object.freeze({
    event: input.event,
    ...(input.staticProviderId ? { staticProviderId: input.staticProviderId } : {}),
    ...(input.staticModelId ? { staticModelId: input.staticModelId } : {}),
    ...(input.selectedProviderId ? { selectedProviderId: input.selectedProviderId } : {}),
    ...(input.selectedModelId ? { selectedModelId: input.selectedModelId } : {}),
    ...(input.capabilityPass != null ? { capabilityPass: input.capabilityPass } : {}),
    ...(input.capabilityReasons?.length
      ? { capabilityReasons: Object.freeze([...input.capabilityReasons]) }
      : {}),
  });
}

export function emitAdaptiveDecisionTelemetry(decision: AdaptiveRoutingDecision): void {
  logAdaptiveRoutingDecision(decision);
  if (decision.telemetry?.event) {
    logAdaptiveMetric(decision.telemetry.event, {
      decision: decision.decision,
      reason: decision.reason,
      correlationId: decision.correlationId ?? decision.decisionId,
      executionId: decision.executionId,
    });
  }
}

export function stampAdaptiveFailoverMetadata(input: {
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly fallbackReason: string;
  readonly finalProviderId: string;
  readonly finalModelId: string;
  readonly executionSucceeded: boolean;
}): Readonly<Record<string, unknown>> {
  const initialProvider =
    typeof input.metadata.initialAdaptiveProviderId === "string"
      ? input.metadata.initialAdaptiveProviderId
      : typeof input.metadata.preferredProviderId === "string"
        ? input.metadata.preferredProviderId
        : undefined;
  const initialModel =
    typeof input.metadata.initialAdaptiveModelId === "string"
      ? input.metadata.initialAdaptiveModelId
      : typeof input.metadata.preferredModelId === "string"
        ? input.metadata.preferredModelId
        : undefined;

  return Object.freeze({
    ...input.metadata,
    adaptiveSelected: true,
    adaptiveExecutionFailed: !input.executionSucceeded,
    adaptiveExecutionSucceeded: input.executionSucceeded,
    fallbackUsed: !input.executionSucceeded,
    fallbackReason: input.fallbackReason,
    ...(initialProvider ? { initialAdaptiveProviderId: initialProvider } : {}),
    ...(initialModel ? { initialAdaptiveModelId: initialModel } : {}),
    finalProviderId: input.finalProviderId,
    finalModelId: input.finalModelId,
    preferredProviderId: input.finalProviderId,
    preferredModelId: input.finalModelId,
  });
}
