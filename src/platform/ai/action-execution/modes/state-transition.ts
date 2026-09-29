/**
 * Phase 15 — STATE_TRANSITION / configure / final via existing CDF state machine.
 */

import { executeCdfAction } from "../../../cdf/state-machine/execute-action";
import type { CdfTransitionAction, CdfTransitionRequest } from "../../../cdf/types";
import type { ActionDefinition } from "../../action-registry";
import type {
  ActionExecutionResult,
  CanonicalActionExecutionRequest,
} from "../types";

function legacyActionFromDefinition(
  action: ActionDefinition,
): CdfTransitionAction | undefined {
  const legacy = action.metadata.legacyTransitionAction;
  if (typeof legacy === "string") return legacy as CdfTransitionAction;
  // configure / materialize phase views → caller supplies transition in input
  const fromInput = action.metadata.cdfActionKind;
  if (fromInput === "select") return "select_route";
  if (fromInput === "approve") return "approve";
  if (fromInput === "final_action") return "final_action";
  return undefined;
}

export function executeStateTransitionAction(
  action: ActionDefinition,
  request: CanonicalActionExecutionRequest,
): ActionExecutionResult {
  const dryRun = request.dryRun === true;
  if (dryRun) {
    return {
      ok: false,
      actionId: action.actionId,
      actionVersion: action.version,
      executionMode: action.executionMode,
      code: "DRY_RUN_UNSUPPORTED",
      message: "CDF state transitions do not support dry-run",
      dryRun: true,
      requestId: request.requestId,
      correlationId: request.correlationId,
      executionId: request.executionId,
    };
  }

  let transitionAction = legacyActionFromDefinition(action);
  if (
    !transitionAction &&
    action.actionId.includes(".configure")
  ) {
    transitionAction = "select_route";
  }
  if (
    !transitionAction &&
    action.actionId.includes(".materialize")
  ) {
    transitionAction = "final_action";
  }
  if (!transitionAction) {
    return {
      ok: false,
      actionId: action.actionId,
      actionVersion: action.version,
      executionMode: action.executionMode,
      code: "EXECUTION_NOT_SUPPORTED",
      message: `No CDF transition mapping for ${action.actionId}`,
      dryRun: false,
      requestId: request.requestId,
      correlationId: request.correlationId,
      executionId: request.executionId,
    };
  }

  const partial = request.input.cdfTransition ?? {};
  const req: CdfTransitionRequest = {
    ...partial,
    action: transitionAction,
    sessionId:
      partial.sessionId ?? request.executionContext.cdfSessionId,
    serviceId:
      partial.serviceId ?? request.executionContext.cdfServiceId,
    phaseId: partial.phaseId ?? request.executionContext.cdfPhaseId,
    organizationId:
      request.authorizationContext.organizationId ??
      request.executionContext.organizationId,
    projectId:
      request.authorizationContext.projectId ??
      request.executionContext.projectId,
    workspaceId: request.executionContext.workspaceId,
    userId:
      request.authorizationContext.userId ??
      request.executionContext.userId,
    requestId: request.requestId ?? partial.requestId,
    artifactId:
      partial.artifactId ??
      request.executionContext.upstreamArtifactRef?.artifactId,
    artifactVersion:
      partial.artifactVersion ??
      request.executionContext.upstreamArtifactRef?.version,
    artifactKey:
      partial.artifactKey ??
      request.executionContext.upstreamArtifactRef?.artifactKey,
  };

  const result = executeCdfAction(req);
  if (!result.ok) {
    const err = result.error as {
      message?: string;
      cdfCode?: string;
      code?: string;
    };
    return {
      ok: false,
      actionId: action.actionId,
      actionVersion: action.version,
      executionMode: action.executionMode,
      code: "EXECUTION_FAILED",
      message: err.message ?? "CDF transition failed",
      dryRun: false,
      requestId: request.requestId,
      correlationId: request.correlationId,
      executionId: request.executionId,
      details: { cdfCode: err.cdfCode ?? err.code },
    };
  }

  const kind =
    action.outputContract.kind === "selection" ||
    action.outputContract.kind === "approval" ||
    action.outputContract.kind === "export_result"
      ? action.outputContract.kind
      : "cdf_transition_result";

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
      kind,
      value: result.value,
      cdfTransition: result.value,
    },
    metadata: {
      delegatedTo: "executeCdfAction",
      legacyTransitionAction: transitionAction,
      sessionId: result.value.session.sessionId,
      sessionVersion: result.value.session.sessionVersion,
    },
  };
}
