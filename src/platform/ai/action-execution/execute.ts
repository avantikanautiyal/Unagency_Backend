/**
 * Phase 15 — Canonical Action Execution entry.
 * Resolves via Phase 14 Action Registry, then delegates to authoritative executors.
 */

import { resolveAction } from "../action-registry";
import { enforceActionAuthorization } from "./authorize";
import { validateActionExecutionRequest } from "./validate";
import {
  emitActionExecutionTraceResult,
  emitActionExecutionTraceStart,
} from "./trace";
import { executeArtifactOperationAction } from "./modes/artifact";
import { executeConversationalResolutionAction } from "./modes/conversational";
import { executeDeterministicAction } from "./modes/deterministic";
import { executeModelGenerationAction } from "./modes/model-generation";
import { executeRenderExportAction } from "./modes/render-export";
import { executeStateTransitionAction } from "./modes/state-transition";
import type {
  ActionExecutionDeps,
  ActionExecutionResult,
  CanonicalActionExecutionRequest,
} from "./types";
import { ACTION_EXECUTION_CONTRACT_VERSION } from "./types";

function fail(
  request: CanonicalActionExecutionRequest,
  code: ActionExecutionResult extends { ok: false; code: infer C } ? C : never,
  message: string,
  extras?: {
    actionVersion?: string;
    executionMode?: CanonicalActionExecutionRequest["executionMode"];
    details?: Readonly<Record<string, unknown>>;
  },
): ActionExecutionResult {
  return {
    ok: false,
    actionId: request.actionId,
    actionVersion: extras?.actionVersion ?? request.actionVersion,
    executionMode: extras?.executionMode ?? request.executionMode,
    code,
    message,
    dryRun: request.dryRun === true,
    requestId: request.requestId,
    correlationId: request.correlationId,
    executionId: request.executionId,
    details: extras?.details,
  };
}

/**
 * Execute a registered action by identity (actionId + optional version).
 * Never executes an arbitrary string without Action Registry resolution.
 */
export async function executeCanonicalAction(
  request: CanonicalActionExecutionRequest,
  deps?: ActionExecutionDeps,
): Promise<ActionExecutionResult> {
  const resolved = resolveAction(request.actionId, request.actionVersion);
  if (!resolved.ok) {
    const mapped =
      resolved.code === "UNKNOWN_ACTION" ||
      resolved.code === "UNSUPPORTED_VERSION" ||
      resolved.code === "ACTION_DISABLED"
        ? resolved.code
        : "EXECUTION_FAILED";
    const result = fail(request, mapped, resolved.message, {
      actionVersion: resolved.version,
      details: {
        availableVersions: resolved.availableVersions,
      },
    });
    return result;
  }

  const action = resolved.action;
  const executionId =
    request.executionId ??
    request.requestId ??
    `exec_p15_${Date.now().toString(36)}`;
  const correlationId = request.correlationId ?? executionId;
  const enrichedRequest: CanonicalActionExecutionRequest = {
    ...request,
    executionId,
    correlationId,
  };

  emitActionExecutionTraceStart({
    action,
    executionId,
    correlationId,
    requestId: request.requestId,
    dryRun: request.dryRun === true,
    cdfSessionId: request.executionContext.cdfSessionId,
    cdfPhaseId: request.executionContext.cdfPhaseId,
  });

  const validation = validateActionExecutionRequest(action, enrichedRequest);
  if (!validation.ok) {
    const result = fail(enrichedRequest, validation.code, validation.message, {
      actionVersion: action.version,
      executionMode: action.executionMode,
      details: validation.details,
    });
    emitActionExecutionTraceResult(result);
    return result;
  }

  // Dry-run must not mutate for MUTATING / EXTERNAL even if supportsDryRun slipped through
  if (
    enrichedRequest.dryRun === true &&
    (action.sideEffectLevel === "MUTATING" ||
      action.sideEffectLevel === "EXTERNAL_SIDE_EFFECT") &&
    action.executionMode !== "CONVERSATIONAL_RESOLUTION" &&
    action.metadata.neverExecutesAi !== true &&
    action.sourceRegistry !== "canonical_semantic"
  ) {
    // Only allow if supportsDryRun AND non-mutating path; otherwise block.
    if (!action.supportsDryRun) {
      const result = fail(
        enrichedRequest,
        "DRY_RUN_UNSUPPORTED",
        "Mutating/external dry-run refused",
        { actionVersion: action.version, executionMode: action.executionMode },
      );
      emitActionExecutionTraceResult(result);
      return result;
    }
  }

  const auth = enforceActionAuthorization(
    action,
    enrichedRequest.authorizationContext,
    enrichedRequest.executionContext,
  );
  if (!auth.ok) {
    const result = fail(enrichedRequest, auth.code, auth.message, {
      actionVersion: action.version,
      executionMode: action.executionMode,
      details: { requirement: auth.requirement },
    });
    emitActionExecutionTraceResult(result);
    return result;
  }

  let result: ActionExecutionResult;
  switch (action.executionMode) {
    case "STATE_TRANSITION":
      result = executeStateTransitionAction(action, enrichedRequest);
      break;
    case "DETERMINISTIC_EXECUTION":
      result = executeDeterministicAction(action, enrichedRequest);
      break;
    case "ARTIFACT_OPERATION":
      result = executeArtifactOperationAction(action, enrichedRequest);
      break;
    case "RENDER_EXPORT":
      result = await executeRenderExportAction(action, enrichedRequest, deps);
      break;
    case "CONVERSATIONAL_RESOLUTION":
      result = executeConversationalResolutionAction(action, enrichedRequest);
      break;
    case "MODEL_GENERATION":
      result = await executeModelGenerationAction(
        action,
        enrichedRequest,
        deps,
      );
      break;
    default: {
      const mode = action.executionMode as string;
      result = fail(
        enrichedRequest,
        "INVALID_EXECUTION_MODE",
        `Unsupported execution mode: ${mode}`,
        { actionVersion: action.version },
      );
    }
  }

  // Exact version identity must remain the resolved version
  if (result.ok && result.actionVersion !== action.version) {
    const corrected: ActionExecutionResult = {
      ok: false,
      actionId: action.actionId,
      actionVersion: action.version,
      executionMode: action.executionMode,
      code: "EXECUTION_FAILED",
      message: "Action version identity drift refused",
      dryRun: enrichedRequest.dryRun === true,
      requestId: enrichedRequest.requestId,
      correlationId,
      executionId,
    };
    emitActionExecutionTraceResult(corrected);
    return corrected;
  }

  emitActionExecutionTraceResult(result);
  return result;
}

export function getActionExecutionContractVersion(): string {
  return ACTION_EXECUTION_CONTRACT_VERSION;
}
