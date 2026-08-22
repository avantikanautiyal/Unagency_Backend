/**
 * Phase 7 refinement errors.
 */

export type RefinementErrorCode =
  | "TENANT_VIOLATION"
  | "REFINEMENT_NOT_FOUND"
  | "SESSION_NOT_FOUND"
  | "SESSION_NOT_ACTIVE"
  | "MAX_QUESTIONS_EXCEEDED"
  | "INVALID_OPTION"
  | "INVALID_QUESTION"
  | "MODE_NOT_SUPPORTED"
  | "SOURCE_NOT_APPROVED"
  | "CONFLICT_BLOCKING"
  | "ALREADY_COMPLETED"
  | "DUPLICATE_ANSWER";

export class RefinementError extends Error {
  readonly code: RefinementErrorCode;

  constructor(code: RefinementErrorCode, message: string) {
    super(message);
    this.name = "RefinementError";
    this.code = code;
  }
}
