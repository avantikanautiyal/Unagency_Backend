/**
 * Step 13 — Record adaptive execution outcome after finalize / failover.
 */

import {
  logAdaptiveMetric,
  logAdaptiveRoutingExecution,
} from "./adaptive-routing-logger";

export type AdaptiveExecutionOutcomeInput = {
  readonly executionId: string;
  readonly correlationId?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly finalProviderId: string;
  readonly finalModelId: string;
  readonly providerSucceeded: boolean;
  readonly fallbackReason?: string;
};

export function resolveAdaptiveExecutionOutcome(
  input: AdaptiveExecutionOutcomeInput,
): Readonly<Record<string, unknown>> {
  const adaptiveSelected = input.metadata.adaptiveSelected === true;
  if (!adaptiveSelected) return input.metadata;

  const initialProvider =
    typeof input.metadata.initialAdaptiveProviderId === "string"
      ? input.metadata.initialAdaptiveProviderId
      : typeof input.metadata.staticProviderId === "string"
        ? input.metadata.staticProviderId
        : undefined;
  const initialModel =
    typeof input.metadata.initialAdaptiveModelId === "string"
      ? input.metadata.initialAdaptiveModelId
      : typeof input.metadata.staticModelId === "string"
        ? input.metadata.staticModelId
        : undefined;

  const fallbackUsed =
    !input.providerSucceeded ||
    (initialProvider != null &&
      initialModel != null &&
      (input.finalProviderId !== initialProvider || input.finalModelId !== initialModel));

  const stamped = Object.freeze({
    ...input.metadata,
    adaptiveExecutionSucceeded: input.providerSucceeded && !fallbackUsed,
    adaptiveExecutionFailed: !input.providerSucceeded || fallbackUsed,
    fallbackUsed,
    ...(fallbackUsed
      ? {
          fallbackReason:
            input.fallbackReason ??
            (typeof input.metadata.fallbackReason === "string"
              ? input.metadata.fallbackReason
              : input.providerSucceeded
                ? "adaptive_candidate_replaced"
                : "adaptive_execution_failure"),
        }
      : {}),
    ...(initialProvider ? { initialAdaptiveProviderId: initialProvider } : {}),
    ...(initialModel ? { initialAdaptiveModelId: initialModel } : {}),
    finalProviderId: input.finalProviderId,
    finalModelId: input.finalModelId,
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
  });

  logAdaptiveRoutingExecution({
    executionId: input.executionId,
    correlationId: input.correlationId,
    adaptiveSelected: true,
    adaptiveExecutionSucceeded: stamped.adaptiveExecutionSucceeded === true,
    adaptiveExecutionFailed: stamped.adaptiveExecutionFailed === true,
    fallbackUsed: fallbackUsed,
    fallbackReason:
      typeof stamped.fallbackReason === "string" ? stamped.fallbackReason : undefined,
    initialAdaptiveProviderId: initialProvider,
    initialAdaptiveModelId: initialModel,
    finalProviderId: input.finalProviderId,
    finalModelId: input.finalModelId,
  });

  if (fallbackUsed) {
    logAdaptiveMetric("adaptive_fallback", {
      executionId: input.executionId,
      correlationId: input.correlationId,
      initialProvider,
      initialModel,
      finalProvider: input.finalProviderId,
      finalModel: input.finalModelId,
    });
  } else if (input.providerSucceeded) {
    logAdaptiveMetric("adaptive_execution_success", {
      executionId: input.executionId,
      correlationId: input.correlationId,
    });
  } else {
    logAdaptiveMetric("adaptive_execution_failure", {
      executionId: input.executionId,
      correlationId: input.correlationId,
    });
  }

  return stamped;
}
