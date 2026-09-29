/**
 * Phase 15 — Canonical Action Execution public surface.
 */

export {
  ACTION_EXECUTION_CONTRACT_VERSION,
  type ActionExecutionErrorCode,
  type CanonicalActionExecutionRequest,
  type CanonicalActionExecutionContext,
  type CanonicalActionAuthorizationContext,
  type CanonicalActionExecutionInput,
  type ActionExecutionResult,
  type ActionExecutionSuccessPayload,
  type ActionExecutionDeps,
  type ActionExecutionResultKind,
} from "./types";

export {
  executeCanonicalAction,
  getActionExecutionContractVersion,
} from "./execute";

export { enforceActionAuthorization } from "./authorize";
export { validateActionExecutionRequest } from "./validate";
export { sanitizeDetails } from "./trace";
