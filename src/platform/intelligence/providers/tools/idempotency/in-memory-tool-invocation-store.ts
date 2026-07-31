/**
 * In-memory tool invocation store — full L1 contract for tests/dev.
 */

import type {
  IToolInvocationStore,
  ToolApprovalDecision,
  ToolContinuationCheckpoint,
  ToolInvocationRecord,
} from "./tool-invocation-store";
import type { ToolExecutionResult } from "../contracts/tool-contracts";

export class InMemoryToolInvocationStore implements IToolInvocationStore {
  private readonly records = new Map<string, ToolInvocationRecord>();

  async get(invocationKey: string): Promise<ToolInvocationRecord | undefined> {
    return this.records.get(invocationKey);
  }

  async listByExecution(executionId: string): Promise<readonly ToolInvocationRecord[]> {
    return [...this.records.values()].filter((r) => r.executionId === executionId);
  }

  async listAwaitingApproval(organizationId: string): Promise<readonly ToolInvocationRecord[]> {
    return [...this.records.values()].filter(
      (r) => r.organizationId === organizationId && r.status === "awaiting_approval"
    );
  }

  async upsertAwaitingApproval(record: ToolInvocationRecord): Promise<ToolInvocationRecord> {
    const existing = this.records.get(record.invocationKey);
    if (existing?.approval) return existing;
    const next = { ...record, status: "awaiting_approval" as const };
    this.records.set(record.invocationKey, next);
    return next;
  }

  async tryClaim(input: {
    readonly invocationKey: string;
    readonly organizationId: string;
    readonly executionId: string;
    readonly round: number;
    readonly toolCallId: string;
    readonly toolName: string;
    readonly workerId: string;
    readonly nowIso: string;
    readonly leaseMs?: number;
    readonly riskClass?: import("../contracts/tool-contracts").ToolRiskClass;
    readonly toolDefinitionVersion?: string;
  }): Promise<{ readonly claimed: boolean; readonly record: ToolInvocationRecord }> {
    const existing = this.records.get(input.invocationKey);
    if (existing) {
      if (
        existing.status === "succeeded" ||
        existing.status === "skipped_idempotent" ||
        existing.status === "failed" ||
        existing.status === "timeout" ||
        existing.status === "denied" ||
        existing.status === "awaiting_approval"
      ) {
        return { claimed: false, record: existing };
      }
      if (existing.status === "running" && existing.claimedBy) {
        return { claimed: false, record: existing };
      }
    }
    const leaseMs = input.leaseMs ?? 30_000;
    const leaseExpiresAt = new Date(Date.parse(input.nowIso) + leaseMs).toISOString();
    const record: ToolInvocationRecord = {
      invocationKey: input.invocationKey,
      organizationId: input.organizationId,
      executionId: input.executionId,
      round: input.round,
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      riskClass: input.riskClass,
      toolDefinitionVersion: input.toolDefinitionVersion,
      status: "running",
      claimedBy: input.workerId,
      leaseExpiresAt,
      createdAt: existing?.createdAt ?? input.nowIso,
      updatedAt: input.nowIso,
      checkpoint: existing?.checkpoint,
      approval: existing?.approval,
      authorizationDecision: existing?.authorizationDecision,
    };
    this.records.set(input.invocationKey, record);
    return { claimed: true, record };
  }

  async releaseClaim(invocationKey: string, workerId: string, nowIso: string): Promise<void> {
    const existing = this.records.get(invocationKey);
    if (!existing || existing.claimedBy !== workerId) return;
    this.records.set(invocationKey, {
      ...existing,
      status: existing.approval?.decision === "approve" ? "authorized" : existing.status,
      claimedBy: undefined,
      leaseExpiresAt: undefined,
      updatedAt: nowIso,
    });
  }

  async reclaimExpiredLeases(nowIso: string, _nowMs: number): Promise<readonly ToolInvocationRecord[]> {
    const out: ToolInvocationRecord[] = [];
    for (const [k, r] of this.records) {
      if (r.status === "running" && r.leaseExpiresAt && r.leaseExpiresAt < nowIso) {
        const next = {
          ...r,
          status: (r.approval?.decision === "approve" ? "authorized" : "pending") as ToolInvocationRecord["status"],
          claimedBy: undefined,
          leaseExpiresAt: undefined,
          updatedAt: nowIso,
        };
        this.records.set(k, next);
        out.push(next);
      }
    }
    return out;
  }

  async complete(
    invocationKey: string,
    result: ToolExecutionResult,
    nowIso: string
  ): Promise<ToolInvocationRecord | undefined> {
    const existing = this.records.get(invocationKey);
    if (!existing) return undefined;
    const next: ToolInvocationRecord = {
      ...existing,
      status: result.status,
      result,
      errorCategory: result.error?.category,
      claimedBy: undefined,
      leaseExpiresAt: undefined,
      updatedAt: nowIso,
      completedAt: nowIso,
    };
    this.records.set(invocationKey, next);
    return next;
  }

  async recordApproval(input: {
    readonly invocationKey: string;
    readonly organizationId: string;
    readonly decision: ToolApprovalDecision;
    readonly expectedToolDefinitionVersion?: string;
  }): Promise<
    | { readonly ok: true; readonly record: ToolInvocationRecord; readonly duplicate: boolean }
    | { readonly ok: false; readonly code: string; readonly message: string }
  > {
    const existing = this.records.get(input.invocationKey);
    if (!existing) {
      return { ok: false, code: "NOT_FOUND", message: "Invocation not found" };
    }
    if (existing.organizationId !== input.organizationId) {
      return { ok: false, code: "TENANT_ISOLATION", message: "Cross-tenant approval denied" };
    }
    if (existing.status !== "awaiting_approval" && !existing.approval) {
      return { ok: false, code: "INVALID_STATE", message: `Cannot approve in status ${existing.status}` };
    }
    if (
      input.expectedToolDefinitionVersion &&
      existing.toolDefinitionVersion &&
      input.expectedToolDefinitionVersion !== existing.toolDefinitionVersion
    ) {
      return {
        ok: false,
        code: "TOOL_DEFINITION_CHANGED",
        message: "Tool definition changed since approval request",
      };
    }
    if (existing.approval) {
      if (existing.approval.decision === input.decision.decision) {
        return { ok: true, record: existing, duplicate: true };
      }
      return {
        ok: false,
        code: "APPROVAL_CONFLICT",
        message: `Already ${existing.approval.decision}`,
      };
    }
    const next: ToolInvocationRecord = {
      ...existing,
      approval: input.decision,
      status: input.decision.decision === "approve" ? "authorized" : "denied",
      updatedAt: input.decision.decidedAt,
      completedAt: input.decision.decision === "reject" ? input.decision.decidedAt : existing.completedAt,
    };
    this.records.set(input.invocationKey, next);
    return { ok: true, record: next, duplicate: false };
  }

  async tryClaimApproved(input: {
    readonly invocationKey: string;
    readonly workerId: string;
    readonly nowIso: string;
    readonly leaseMs?: number;
  }): Promise<{ readonly claimed: boolean; readonly record: ToolInvocationRecord | undefined }> {
    const existing = this.records.get(input.invocationKey);
    if (!existing) return { claimed: false, record: undefined };
    if (existing.result) return { claimed: false, record: existing };
    if (existing.approval?.decision !== "approve") {
      return { claimed: false, record: existing };
    }
    if (existing.status === "running" && existing.claimedBy && existing.claimedBy !== input.workerId) {
      if (existing.leaseExpiresAt && existing.leaseExpiresAt > input.nowIso) {
        return { claimed: false, record: existing };
      }
    }
    const leaseMs = input.leaseMs ?? 30_000;
    const next: ToolInvocationRecord = {
      ...existing,
      status: "running",
      claimedBy: input.workerId,
      leaseExpiresAt: new Date(Date.parse(input.nowIso) + leaseMs).toISOString(),
      updatedAt: input.nowIso,
    };
    this.records.set(input.invocationKey, next);
    return { claimed: true, record: next };
  }

  async updateCheckpoint(
    invocationKey: string,
    checkpoint: ToolContinuationCheckpoint,
    nowIso: string
  ): Promise<void> {
    const existing = this.records.get(invocationKey);
    if (!existing) return;
    this.records.set(invocationKey, { ...existing, checkpoint, updatedAt: nowIso });
  }

  clear(): void {
    this.records.clear();
  }
}
