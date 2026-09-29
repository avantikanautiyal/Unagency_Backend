/**
 * Phase 15 — Input / required-context validation (presence only; no resolution).
 */

import type { ActionContextComponent, ActionDefinition } from "../action-registry";
import type {
  ActionExecutionErrorCode,
  CanonicalActionExecutionRequest,
} from "./types";

export type ActionValidationResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: ActionExecutionErrorCode;
      readonly message: string;
      readonly details?: Readonly<Record<string, unknown>>;
    };

function contextPresent(
  req: CanonicalActionExecutionRequest,
  key: ActionContextComponent,
): boolean {
  const flagged = req.executionContext.presentContext?.[key];
  if (flagged === true) return true;

  switch (key) {
    case "current_instruction":
      return Boolean(
        req.executionContext.currentInstruction?.trim() ||
          req.input.orchestration?.conversationalInstruction?.trim() ||
          req.input.cdfTransition?.refinePrompt?.trim(),
      );
    case "cdf_session":
      return Boolean(
        req.executionContext.cdfSessionId ||
          req.input.cdfTransition?.sessionId ||
          req.input.artifactCreate?.sessionId,
      );
    case "cdf_phase":
      return Boolean(
        req.executionContext.cdfPhaseId ||
          req.input.cdfTransition?.phaseId,
      );
    case "cdf_context":
      return Boolean(
        req.executionContext.cdfSessionId &&
          req.executionContext.cdfPhaseId,
      );
    case "upstream_artifact":
      return Boolean(
        req.executionContext.upstreamArtifactRef?.artifactId &&
          req.executionContext.upstreamArtifactRef.version != null,
      );
    case "user_selection":
      return req.executionContext.userSelection !== undefined;
    case "configuration":
      return (
        req.executionContext.configuration != null ||
        req.input.artifactCreate != null ||
        req.input.cdfTransition?.routeIndex != null ||
        req.input.cdfTransition?.routeTitle != null
      );
    case "output_contract":
      // Assembled by Context Orchestrator for generation — presence flag or phase id.
      return (
        flagged === true ||
        Boolean(req.executionContext.cdfPhaseId)
      );
    case "requirements":
    case "constraints":
    case "exclusions":
    case "selections":
    case "approved_decisions":
    case "resolved_reference":
    case "working_memory":
    case "multimodal_context":
    case "active_brief":
    case "production_spec":
    case "authority":
    case "provider_model":
      return flagged === true;
    default:
      return flagged === true;
  }
}

export function validateActionExecutionRequest(
  action: ActionDefinition,
  request: CanonicalActionExecutionRequest,
): ActionValidationResult {
  if (
    request.executionMode != null &&
    request.executionMode !== action.executionMode
  ) {
    return {
      ok: false,
      code: "INVALID_EXECUTION_MODE",
      message: `Request executionMode ${request.executionMode} does not match action ${action.executionMode}`,
      details: {
        requested: request.executionMode,
        defined: action.executionMode,
      },
    };
  }

  if (request.dryRun === true && !action.supportsDryRun) {
    return {
      ok: false,
      code: "DRY_RUN_UNSUPPORTED",
      message: `Action ${action.actionId} does not support dry-run`,
    };
  }

  if (
    request.dryRun === true &&
    (action.sideEffectLevel === "MUTATING" ||
      action.sideEffectLevel === "EXTERNAL_SIDE_EFFECT") &&
    !action.supportsDryRun
  ) {
    return {
      ok: false,
      code: "DRY_RUN_UNSUPPORTED",
      message: "Mutating/external actions cannot dry-run without supportsDryRun",
    };
  }

  const missing: ActionContextComponent[] = [];
  for (const key of action.requiredContext) {
    // start creates the session — cdf_session is an output, not a pre-req
    if (
      key === "cdf_session" &&
      action.actionId === "cdf.transition.start"
    ) {
      continue;
    }
    if (!contextPresent(request, key)) {
      missing.push(key);
    }
  }
  if (missing.length > 0) {
    return {
      ok: false,
      code: "MISSING_REQUIRED_CONTEXT",
      message: `Missing required context: ${missing.join(", ")}`,
      details: { missing },
    };
  }

  // Mode-specific structural input checks
  switch (action.executionMode) {
    case "STATE_TRANSITION":
    case "RENDER_EXPORT":
      if (
        action.actionId.startsWith("cdf.transition.") &&
        !request.input.cdfTransition &&
        action.metadata.legacyTransitionAction !== "start"
      ) {
        // start may omit cdfTransition beyond serviceId in executionContext
        if (!request.executionContext.cdfServiceId && !request.input.cdfTransition) {
          return {
            ok: false,
            code: "INVALID_INPUT",
            message: "cdfTransition input required for CDF transition actions",
          };
        }
      }
      break;
    case "ARTIFACT_OPERATION":
      if (action.actionId === "artifact.create" && !request.input.artifactCreate) {
        return {
          ok: false,
          code: "INVALID_INPUT",
          message: "artifactCreate input required",
        };
      }
      if (
        action.actionId === "artifact.createVersion" &&
        !request.input.artifactCreateVersion
      ) {
        return {
          ok: false,
          code: "INVALID_INPUT",
          message: "artifactCreateVersion input required",
        };
      }
      if (
        (action.actionId === "artifact.select" ||
          action.actionId === "artifact.approve") &&
        !request.input.artifactSelectApprove
      ) {
        return {
          ok: false,
          code: "INVALID_INPUT",
          message: "artifactSelectApprove input required",
        };
      }
      break;
    case "CONVERSATIONAL_RESOLUTION":
      if (!request.input.conversational) {
        return {
          ok: false,
          code: "INVALID_INPUT",
          message: "conversational resolution context required",
        };
      }
      break;
    case "MODEL_GENERATION":
      if (
        action.actionId.startsWith("cdf.phase.") &&
        action.actionId.endsWith(".generate")
      ) {
        if (
          !request.executionContext.cdfSessionId ||
          !request.executionContext.cdfPhaseId
        ) {
          return {
            ok: false,
            code: "MISSING_REQUIRED_CONTEXT",
            message: "cdfSessionId and cdfPhaseId required for phase generation",
          };
        }
      }
      break;
    default:
      break;
  }

  return { ok: true };
}
