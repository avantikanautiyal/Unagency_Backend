/**
 * Durable tool invocation store — claim/lease/approval for production composition.
 */

import type {
  ToolAuthorizationDecision,
  ToolExecutionResult,
  ToolInvocationStatus,
  ToolRiskClass,
} from "../contracts/tool-contracts";

export type ToolApprovalDecisionKind = "approve" | "reject";

export interface ToolApprovalDecision {
  readonly decision: ToolApprovalDecisionKind;
  readonly principalUserId: string;
  readonly decidedAt: string;
  readonly reason?: string;
}

export interface ToolContinuationCheckpoint {
  readonly messages: readonly Record<string, unknown>[];
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityId: string;
  readonly prompt: string;
  readonly toolNames: readonly string[];
  readonly structuredOutput?: Readonly<Record<string, unknown>>;
  readonly allowSideEffectsWithoutApproval?: boolean;
  readonly aggregatedUsage?: Readonly<Record<string, number>>;
  readonly modelRounds?: number;
  readonly assistantToolCalls?: readonly unknown[];
  readonly pendingToolCall?: {
    readonly id: string;
    readonly name: string;
    readonly arguments: Readonly<Record<string, unknown>>;
  };
  /** awaiting_approval | awaiting_continuation — resume authority without re-running tools. */
  readonly phase?: "awaiting_approval" | "awaiting_continuation";
  readonly roles?: readonly string[];
  readonly principalUserId?: string;
  readonly workspaceId?: string;
  readonly requestId?: string;
}

export interface ToolInvocationRecord {
  readonly invocationKey: string;
  readonly organizationId: string;
  readonly executionId: string;
  readonly round: number;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly riskClass?: ToolRiskClass;
  readonly toolDefinitionVersion?: string;
  readonly status: ToolInvocationStatus;
  readonly authorizationDecision?: ToolAuthorizationDecision;
  readonly approval?: ToolApprovalDecision;
  readonly claimedBy?: string;
  readonly leaseExpiresAt?: string;
  readonly result?: ToolExecutionResult;
  readonly checkpoint?: ToolContinuationCheckpoint;
  readonly errorCategory?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt?: string;
}

export interface IToolInvocationStore {
  get(invocationKey: string): Promise<ToolInvocationRecord | undefined>;
  listByExecution(executionId: string): Promise<readonly ToolInvocationRecord[]>;
  listAwaitingApproval(organizationId: string): Promise<readonly ToolInvocationRecord[]>;

  /** Persist awaiting_approval without executing handler. */
  upsertAwaitingApproval(record: ToolInvocationRecord): Promise<ToolInvocationRecord>;

  /**
   * Atomic claim for execution. If record exists in terminal/approved states,
   * returns claimed=false with existing record.
   */
  tryClaim(input: {
    readonly invocationKey: string;
    readonly organizationId: string;
    readonly executionId: string;
    readonly round: number;
    readonly toolCallId: string;
    readonly toolName: string;
    readonly workerId: string;
    readonly nowIso: string;
    readonly leaseMs?: number;
    readonly riskClass?: ToolRiskClass;
    readonly toolDefinitionVersion?: string;
  }): Promise<{ readonly claimed: boolean; readonly record: ToolInvocationRecord }>;

  releaseClaim(invocationKey: string, workerId: string, nowIso: string): Promise<void>;
  reclaimExpiredLeases(nowIso: string, nowMs: number): Promise<readonly ToolInvocationRecord[]>;

  complete(
    invocationKey: string,
    result: ToolExecutionResult,
    nowIso: string
  ): Promise<ToolInvocationRecord | undefined>;

  /**
   * Record authenticated approval/rejection. Idempotent for same decision.
   * Conflicts if already decided differently.
   */
  recordApproval(input: {
    readonly invocationKey: string;
    readonly organizationId: string;
    readonly decision: ToolApprovalDecision;
    readonly expectedToolDefinitionVersion?: string;
  }): Promise<
    | { readonly ok: true; readonly record: ToolInvocationRecord; readonly duplicate: boolean }
    | { readonly ok: false; readonly code: string; readonly message: string }
  >;

  /**
   * Claim an approved invocation for resume execution.
   */
  tryClaimApproved(input: {
    readonly invocationKey: string;
    readonly workerId: string;
    readonly nowIso: string;
    readonly leaseMs?: number;
  }): Promise<{ readonly claimed: boolean; readonly record: ToolInvocationRecord | undefined }>;

  updateCheckpoint(
    invocationKey: string,
    checkpoint: ToolContinuationCheckpoint,
    nowIso: string
  ): Promise<void>;
}

export function buildToolInvocationKey(input: {
  readonly organizationId: string;
  readonly executionId: string;
  readonly round: number;
  readonly toolCallId: string;
  readonly toolName: string;
}): string {
  return [
    input.organizationId,
    "tool",
    input.executionId,
    `r${input.round}`,
    input.toolCallId,
    input.toolName,
  ].join(":");
}

export function hashToolDefinitionVersion(input: {
  readonly name: string;
  readonly riskClass: string;
  readonly inputSchema: unknown;
}): string {
  const raw = JSON.stringify({
    name: input.name,
    riskClass: input.riskClass,
    inputSchema: input.inputSchema,
  });
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash << 5) - hash + raw.charCodeAt(i);
    hash |= 0;
  }
  return `tdv_${Math.abs(hash).toString(16)}`;
}
