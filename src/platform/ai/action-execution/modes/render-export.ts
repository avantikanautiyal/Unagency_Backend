/**
 * Phase 15 — RENDER_EXPORT → renderArtifact or CDF final_action.
 */

import { renderArtifact } from "../../../cdf/rendering/service";
import type { ActionDefinition } from "../../action-registry";
import type {
  ActionExecutionDeps,
  ActionExecutionResult,
  CanonicalActionExecutionRequest,
} from "../types";
import { executeStateTransitionAction } from "./state-transition";

export async function executeRenderExportAction(
  action: ActionDefinition,
  request: CanonicalActionExecutionRequest,
  _deps?: ActionExecutionDeps,
): Promise<ActionExecutionResult> {
  const dryRun = request.dryRun === true;
  if (dryRun) {
    return {
      ok: false,
      actionId: action.actionId,
      actionVersion: action.version,
      executionMode: action.executionMode,
      code: "DRY_RUN_UNSUPPORTED",
      message: "Render/export actions do not support dry-run",
      dryRun: true,
      requestId: request.requestId,
      correlationId: request.correlationId,
      executionId: request.executionId,
    };
  }

  if (
    action.actionId === "artifact.render" ||
    action.sourceRegistry === "cdf_renderer_registry"
  ) {
    if (!request.input.render) {
      return {
        ok: false,
        actionId: action.actionId,
        actionVersion: action.version,
        executionMode: action.executionMode,
        code: "INVALID_INPUT",
        message: "render request required",
        dryRun: false,
        requestId: request.requestId,
        correlationId: request.correlationId,
        executionId: request.executionId,
      };
    }
    try {
      const file = await renderArtifact({
        ...request.input.render,
        organizationId:
          request.input.render.organizationId ??
          request.authorizationContext.organizationId ??
          request.executionContext.organizationId,
        projectId:
          request.input.render.projectId ??
          request.authorizationContext.projectId ??
          request.executionContext.projectId,
        correlationId:
          request.input.render.correlationId ?? request.correlationId,
        requestId: request.input.render.requestId ?? request.requestId,
      });
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
          kind: "render_result",
          value: { fileId: file.fileId, format: file.format },
          renderedFile: file,
        },
        metadata: {
          delegatedTo: "renderArtifact",
          fileId: file.fileId,
          artifactId: file.artifactId,
          artifactVersion: file.artifactVersion,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        actionId: action.actionId,
        actionVersion: action.version,
        executionMode: action.executionMode,
        code: "EXECUTION_FAILED",
        message,
        dryRun: false,
        requestId: request.requestId,
        correlationId: request.correlationId,
        executionId: request.executionId,
      };
    }
  }

  // CDF final_action / materialize → existing state machine
  return executeStateTransitionAction(action, request);
}
