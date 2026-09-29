/**
 * Phase 15 — ARTIFACT_OPERATION → existing artifact repository.
 */

import {
  createArtifact,
  createVersion,
  markApproved,
  markSelected,
} from "../../../cdf/artifacts/repository";
import type { ActionDefinition } from "../../action-registry";
import type {
  ActionExecutionResult,
  CanonicalActionExecutionRequest,
} from "../types";

export function executeArtifactOperationAction(
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
      message: "Artifact operations do not support dry-run",
      dryRun: true,
      requestId: request.requestId,
      correlationId: request.correlationId,
      executionId: request.executionId,
    };
  }

  const org =
    request.authorizationContext.organizationId ??
    request.executionContext.organizationId;
  const project =
    request.authorizationContext.projectId ??
    request.executionContext.projectId;
  const ownership = { organizationId: org, projectId: project };

  try {
    if (action.actionId === "artifact.create") {
      const input = request.input.artifactCreate!;
      const created = createArtifact({
        ...input,
        sessionId:
          input.sessionId ?? request.executionContext.cdfSessionId!,
        organizationId: org,
        projectId: project,
        requestId: request.requestId ?? input.requestId,
      });
      return successArtifact(action, request, "artifact_version", created, {
        delegatedTo: "createArtifact",
        artifactId: created.artifact.artifactId,
        version: created.version.version,
      });
    }

    if (action.actionId === "artifact.createVersion") {
      const input = request.input.artifactCreateVersion!;
      const created = createVersion({
        ...input,
        organizationId: org,
        projectId: project,
        requestId: request.requestId ?? input.requestId,
      });
      return successArtifact(action, request, "artifact_version", created, {
        delegatedTo: "createVersion",
        artifactId: created.artifact.artifactId,
        version: created.version.version,
      });
    }

    if (action.actionId === "artifact.select") {
      const sel = request.input.artifactSelectApprove!;
      const out = markSelected(sel.artifactId, sel.version, ownership);
      return successArtifact(action, request, "selection", out, {
        delegatedTo: "markSelected",
        artifactId: out.artifact.artifactId,
        version: out.version.version,
      });
    }

    if (action.actionId === "artifact.approve") {
      const sel = request.input.artifactSelectApprove!;
      const out = markApproved(sel.artifactId, sel.version, ownership);
      return successArtifact(action, request, "approval", out, {
        delegatedTo: "markApproved",
        artifactId: out.artifact.artifactId,
        version: out.version.version,
      });
    }

    return {
      ok: false,
      actionId: action.actionId,
      actionVersion: action.version,
      executionMode: action.executionMode,
      code: "EXECUTION_NOT_SUPPORTED",
      message: `Unknown artifact operation ${action.actionId}`,
      dryRun: false,
      requestId: request.requestId,
      correlationId: request.correlationId,
      executionId: request.executionId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const artifactCode =
      err &&
      typeof err === "object" &&
      "artifactCode" in err
        ? String((err as { artifactCode: string }).artifactCode)
        : undefined;
    const code =
      artifactCode === "ARTIFACT_OWNERSHIP_INVALID"
        ? "UNAUTHORIZED"
        : "EXECUTION_FAILED";
    return {
      ok: false,
      actionId: action.actionId,
      actionVersion: action.version,
      executionMode: action.executionMode,
      code,
      message,
      dryRun: false,
      requestId: request.requestId,
      correlationId: request.correlationId,
      executionId: request.executionId,
      details: artifactCode ? { artifactCode } : undefined,
    };
  }
}

function successArtifact(
  action: ActionDefinition,
  request: CanonicalActionExecutionRequest,
  kind: "artifact_version" | "selection" | "approval",
  value: unknown,
  metadata: Record<string, unknown>,
): ActionExecutionResult {
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
    result: { kind, value },
    metadata,
  };
}
