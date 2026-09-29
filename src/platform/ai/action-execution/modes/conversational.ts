/**
 * Phase 15 — CONVERSATIONAL_RESOLUTION → CTI identify-only (no side effects).
 */

import { resolveConversationalAction } from "../../../collaboration/conversational-task-intelligence/action-resolution";
import type { ActionDefinition } from "../../action-registry";
import type {
  ActionExecutionResult,
  CanonicalActionExecutionRequest,
} from "../types";

export function executeConversationalResolutionAction(
  action: ActionDefinition,
  request: CanonicalActionExecutionRequest,
): ActionExecutionResult {
  const dryRun = request.dryRun === true;
  // Identify-only: dry-run and live are equivalent (no mutation).
  const ctx = request.input.conversational!;
  const resolved = resolveConversationalAction(ctx);

  // Optionally verify registry action matches resolved intent identity.
  const expected =
    typeof action.metadata.conversationalAction === "string"
      ? action.metadata.conversationalAction
      : undefined;

  return {
    ok: true,
    actionId: action.actionId,
    actionVersion: action.version,
    executionMode: action.executionMode,
    sideEffectLevel: action.sideEffectLevel,
    dryRun,
    requestId: request.requestId,
    correlationId: request.correlationId,
    executionId: request.executionId,
    result: {
      kind: "conversational_action_resolution",
      value: {
        resolvedAction: resolved,
        registryAction: expected,
        identifiesOnly: true,
        executedSideEffects: false,
      },
      conversationalAction: resolved,
    },
    metadata: {
      delegatedTo: "resolveConversationalAction",
      identifiesOnly: true,
      executedSideEffects: false,
      replacesCti: false,
    },
  };
}
