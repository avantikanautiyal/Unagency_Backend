/**
 * M1B — Typed CDF transition errors (machine-readable).
 */

import { ValidationError } from "../../core/errors";

export type CdfTransitionErrorCode =
  | "SESSION_NOT_FOUND"
  | "SESSION_VERSION_CONFLICT"
  | "INVALID_SERVICE"
  | "INVALID_PHASE"
  | "ACTION_NOT_ALLOWED"
  | "INVALID_ACTION_PAYLOAD"
  | "DEPENDENCY_NOT_SATISFIED"
  | "SELECTION_REQUIRED"
  | "INVALID_SELECTION"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_INVALID"
  | "REFINEMENT_NOT_ALLOWED"
  | "FINAL_ACTION_NOT_ALLOWED"
  | "SESSION_ALREADY_COMPLETE"
  | "CONTRACT_VERSION_MISMATCH"
  | "PHASE_INACTIVE"
  | "IDEMPOTENCY_CONFLICT"
  | "DURABILITY_FAILED";

export class CdfTransitionError extends ValidationError {
  readonly cdfCode: CdfTransitionErrorCode;

  constructor(
    cdfCode: CdfTransitionErrorCode,
    message: string,
    metadata?: Record<string, unknown>,
  ) {
    super(message, { cdfCode, ...metadata });
    this.name = "CdfTransitionError";
    this.cdfCode = cdfCode;
  }
}

export function cdfError(
  code: CdfTransitionErrorCode,
  message: string,
  metadata?: Record<string, unknown>,
): CdfTransitionError {
  return new CdfTransitionError(code, message, metadata);
}
