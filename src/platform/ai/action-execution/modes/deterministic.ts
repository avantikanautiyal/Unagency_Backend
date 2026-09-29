/**
 * Phase 15 — DETERMINISTIC_EXECUTION (non-LLM).
 * Never invokes Model Runtime or providers.
 */

import type { ActionDefinition } from "../../action-registry";
import type {
  ActionExecutionResult,
  CanonicalActionExecutionRequest,
} from "../types";
import { executeStateTransitionAction } from "./state-transition";

export function executeDeterministicAction(
  action: ActionDefinition,
  request: CanonicalActionExecutionRequest,
): ActionExecutionResult {
  const dryRun = request.dryRun === true;

  // Configure-style phase actions that landed in DETERMINISTIC_EXECUTION → CDF SM
  if (
    action.actionId.startsWith("cdf.phase.") &&
    (action.actionId.endsWith(".configure") ||
      action.actionId.endsWith(".materialize"))
  ) {
    return executeStateTransitionAction(action, {
      ...request,
      executionMode: "STATE_TRANSITION",
    });
  }

  // Test-only / semantic deterministic stubs
  if (action.sourceRegistry === "canonical_semantic") {
    if (dryRun && action.supportsDryRun) {
      return {
        ok: true,
        actionId: action.actionId,
        actionVersion: action.version,
        executionMode: action.executionMode,
        sideEffectLevel: action.sideEffectLevel,
        dryRun: true,
        requestId: request.requestId,
        correlationId: request.correlationId,
        executionId: request.executionId,
        result: {
          kind: "deterministic_result",
          value: { dryRun: true, mutated: false },
        },
        metadata: {
          delegatedTo: "canonical_semantic_noop",
          modelRuntimeInvoked: false,
          providerInvoked: false,
        },
      };
    }
    return {
      ok: true,
      actionId: action.actionId,
      actionVersion: action.version,
      executionMode: action.executionMode,
      sideEffectLevel: action.sideEffectLevel,
      dryRun: false,
      requestId: request.requestId,
      correlationId: request.correlationId,
      executionId: request.executionId,
      result: {
        kind: "deterministic_result",
        value: { completed: true },
      },
      metadata: {
        delegatedTo: "canonical_semantic_noop",
        modelRuntimeInvoked: false,
        providerInvoked: false,
      },
    };
  }

  return {
    ok: false,
    actionId: action.actionId,
    actionVersion: action.version,
    executionMode: action.executionMode,
    code: "EXECUTION_NOT_SUPPORTED",
    message: `No deterministic executor mapping for ${action.actionId}`,
    dryRun,
    requestId: request.requestId,
    correlationId: request.correlationId,
    executionId: request.executionId,
  };
}
