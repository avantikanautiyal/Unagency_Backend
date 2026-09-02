/**
 * M9.5L — Canonical tool / structured-output contracts (provider-neutral).
 */

export type ToolRiskClass = "read_only" | "write" | "external_side_effect" | "high_risk";

export type ToolAuthorizationDecision =
  | "allow"
  | "deny"
  | "requires_approval";

export type ToolInvocationStatus =
  | "pending"
  | "authorized"
  | "denied"
  | "awaiting_approval"
  | "running"
  | "succeeded"
  | "failed"
  | "timeout"
  | "skipped_idempotent";

export type ToolFailureCategory =
  | "tool_not_found"
  | "tool_argument_invalid"
  | "tool_unauthorized"
  | "tool_approval_required"
  | "tool_timeout"
  | "tool_execution_failed"
  | "tool_result_invalid"
  | "tool_budget_exhausted"
  | "tool_forbidden_operation";

/** JSON Schema subset used for tool args + structured output (no Ajv dependency). */
export type JsonSchemaLike = Readonly<Record<string, unknown>>;

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonSchemaLike;
  readonly riskClass: ToolRiskClass;
  readonly requiredPermissions?: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: Readonly<Record<string, unknown>>;
}

export interface ToolExecutionResult {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly status: ToolInvocationStatus;
  readonly output?: unknown;
  readonly error?: {
    readonly category: ToolFailureCategory;
    readonly message: string;
  };
  readonly latencyMs: number;
  readonly authorizationDecision?: ToolAuthorizationDecision;
  readonly invocationKey: string;
  readonly round: number;
}

export interface StructuredOutputRequest {
  readonly schema: JsonSchemaLike;
  readonly name?: string;
  readonly strict?: boolean;
}

export interface StructuredOutputValidationResult {
  readonly valid: boolean;
  readonly parsed?: unknown;
  readonly errors: readonly string[];
}

export interface ToolRoundSummary {
  readonly round: number;
  readonly toolCallsRequested: number;
  readonly toolCallsExecuted: number;
  readonly toolCallsDenied: number;
  readonly toolFailures: number;
  readonly results: readonly ToolExecutionResult[];
}

export interface ToolOrchestrationSummary {
  readonly modelRounds: number;
  readonly toolRounds: readonly ToolRoundSummary[];
  readonly totalToolCallsRequested: number;
  readonly totalToolCallsExecuted: number;
  readonly totalToolCallsDenied: number;
  readonly totalToolFailures: number;
  readonly structuredOutputValid?: boolean;
  readonly budgetExhausted: boolean;
  readonly sideEffectExecuted: boolean;
}
