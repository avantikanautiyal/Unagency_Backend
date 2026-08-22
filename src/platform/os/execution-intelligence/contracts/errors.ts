/**
 * Execution Intelligence errors — Phase 4.
 */

export type ExecutionIntelligenceErrorCode =
  | "PLAN_INVALID"
  | "PLAN_INVALID_CYCLE"
  | "PLAN_UNSUPPORTED_CAPABILITY"
  | "PLAN_MISSING_OUTPUT_CONTRACT"
  | "PLAN_TENANT_VIOLATION"
  | "PLAN_BLOCKED"
  | "PLAN_INVALID_INPUT";

export class ExecutionIntelligenceError extends Error {
  readonly code: ExecutionIntelligenceErrorCode;

  constructor(code: ExecutionIntelligenceErrorCode, message: string) {
    super(message);
    this.name = "ExecutionIntelligenceError";
    this.code = code;
  }
}
