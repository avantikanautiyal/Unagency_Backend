/**
 * Phase 6 evaluation errors.
 */

export type EvaluationErrorCode =
  | "EVAL_TENANT_VIOLATION"
  | "EVAL_INVALID_INPUT"
  | "EVALUATOR_NOT_FOUND"
  | "EVAL_FAILED";

export class EvaluationError extends Error {
  readonly code: EvaluationErrorCode;
  constructor(code: EvaluationErrorCode, message: string) {
    super(message);
    this.name = "EvaluationError";
    this.code = code;
  }
}
