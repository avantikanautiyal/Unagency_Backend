/**
 * Mongo-backed tool invocation store — unique invocationKey + atomic claim/approval.
 */

import { Schema, model, type Document } from "mongoose";
import type {
  IToolInvocationStore,
  ToolApprovalDecision,
  ToolContinuationCheckpoint,
  ToolInvocationRecord,
} from "./tool-invocation-store";
import type { ToolExecutionResult } from "../contracts/tool-contracts";

type ToolInvocationDoc = Document & ToolInvocationRecord & { version?: number };

const enterpriseToolInvocationSchema = new Schema(
  {
    invocationKey: { type: String, required: true, unique: true, index: true },
    organizationId: { type: String, required: true, index: true },
    executionId: { type: String, required: true, index: true },
    round: { type: Number, required: true },
    toolCallId: { type: String, required: true },
    toolName: { type: String, required: true },
    riskClass: String,
    toolDefinitionVersion: String,
    status: { type: String, required: true, index: true },
    authorizationDecision: String,
    approval: Schema.Types.Mixed,
    claimedBy: { type: String, index: true, sparse: true },
    leaseExpiresAt: { type: String, index: true, sparse: true },
    result: Schema.Types.Mixed,
    checkpoint: Schema.Types.Mixed,
    errorCategory: String,
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
    completedAt: String,
    version: { type: Number, default: 0 },
  },
  { collection: "enterprise_tool_invocations" }
);

enterpriseToolInvocationSchema.index({ organizationId: 1, status: 1 });

export const EnterpriseToolInvocation = model<ToolInvocationDoc>(
  "EnterpriseToolInvocation",
  enterpriseToolInvocationSchema
);

function toRecord(doc: Record<string, unknown>): ToolInvocationRecord {
  return {
    invocationKey: String(doc.invocationKey),
    organizationId: String(doc.organizationId),
    executionId: String(doc.executionId),
    round: Number(doc.round),
    toolCallId: String(doc.toolCallId),
    toolName: String(doc.toolName),
    riskClass: doc.riskClass as ToolInvocationRecord["riskClass"],
    toolDefinitionVersion: doc.toolDefinitionVersion
      ? String(doc.toolDefinitionVersion)
      : undefined,
    status: doc.status as ToolInvocationRecord["status"],
    authorizationDecision: doc.authorizationDecision as ToolInvocationRecord["authorizationDecision"],
    approval: doc.approval as ToolApprovalDecision | undefined,
    claimedBy: doc.claimedBy ? String(doc.claimedBy) : undefined,
    leaseExpiresAt: doc.leaseExpiresAt ? String(doc.leaseExpiresAt) : undefined,
    result: doc.result as ToolExecutionResult | undefined,
    checkpoint: doc.checkpoint as ToolContinuationCheckpoint | undefined,
    errorCategory: doc.errorCategory ? String(doc.errorCategory) : undefined,
    createdAt: String(doc.createdAt),
    updatedAt: String(doc.updatedAt),
    completedAt: doc.completedAt ? String(doc.completedAt) : undefined,
  };
}

export class MongoToolInvocationStore implements IToolInvocationStore {
  private static indexesReady: Promise<void> | undefined;

  private static ensureIndexes(): Promise<void> {
    if (!MongoToolInvocationStore.indexesReady) {
      MongoToolInvocationStore.indexesReady = EnterpriseToolInvocation.createIndexes().then(
        () => undefined
      );
    }
    return MongoToolInvocationStore.indexesReady;
  }

  async get(invocationKey: string): Promise<ToolInvocationRecord | undefined> {
    await MongoToolInvocationStore.ensureIndexes();
    const doc = await EnterpriseToolInvocation.findOne({ invocationKey }).lean();
    return doc ? toRecord(doc as Record<string, unknown>) : undefined;
  }

  async listByExecution(executionId: string): Promise<readonly ToolInvocationRecord[]> {
    await MongoToolInvocationStore.ensureIndexes();
    const docs = await EnterpriseToolInvocation.find({ executionId }).lean();
    return docs.map((d) => toRecord(d as Record<string, unknown>));
  }

  async listAwaitingApproval(organizationId: string): Promise<readonly ToolInvocationRecord[]> {
    await MongoToolInvocationStore.ensureIndexes();
    const docs = await EnterpriseToolInvocation.find({
      organizationId,
      status: "awaiting_approval",
    }).lean();
    return docs.map((d) => toRecord(d as Record<string, unknown>));
  }

  async upsertAwaitingApproval(record: ToolInvocationRecord): Promise<ToolInvocationRecord> {
    await MongoToolInvocationStore.ensureIndexes();
    try {
      const doc = await EnterpriseToolInvocation.findOneAndUpdate(
        { invocationKey: record.invocationKey },
        {
          $setOnInsert: {
            ...record,
            status: "awaiting_approval",
            version: 0,
          },
        },
        { upsert: true, new: true }
      ).lean();
      return toRecord(doc as Record<string, unknown>);
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code === 11000) {
        const existing = await this.get(record.invocationKey);
        if (existing) return existing;
      }
      throw err;
    }
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
    await MongoToolInvocationStore.ensureIndexes();
    const leaseMs = input.leaseMs ?? 30_000;
    const leaseExpiresAt = new Date(Date.parse(input.nowIso) + leaseMs).toISOString();

    // Insert-if-absent atomic path
    try {
      const created = (await EnterpriseToolInvocation.findOneAndUpdate(
        { invocationKey: input.invocationKey },
        {
          $setOnInsert: {
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
            createdAt: input.nowIso,
            updatedAt: input.nowIso,
            version: 0,
          },
        },
        { upsert: true, new: true, rawResult: true }
      )) as unknown as {
        value?: Record<string, unknown> | null;
        lastErrorObject?: { upserted?: unknown };
      };
      const doc = created.value ?? null;
      if (!doc) {
        const existing = await this.get(input.invocationKey);
        return { claimed: false, record: existing! };
      }
      const wasInsert =
        created.lastErrorObject?.upserted != null ||
        String(doc.claimedBy) === input.workerId;
      if (wasInsert && String(doc.claimedBy) === input.workerId && doc.status === "running") {
        return { claimed: true, record: toRecord(doc) };
      }
      return { claimed: false, record: toRecord(doc) };
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code === 11000) {
        const existing = await this.get(input.invocationKey);
        return { claimed: false, record: existing! };
      }
      throw err;
    }
  }

  async releaseClaim(invocationKey: string, workerId: string, nowIso: string): Promise<void> {
    await EnterpriseToolInvocation.updateOne(
      { invocationKey, claimedBy: workerId },
      {
        $set: { updatedAt: nowIso },
        $unset: { claimedBy: 1, leaseExpiresAt: 1 },
      }
    );
  }

  async reclaimExpiredLeases(
    nowIso: string,
    _nowMs: number
  ): Promise<readonly ToolInvocationRecord[]> {
    await MongoToolInvocationStore.ensureIndexes();
    const docs = await EnterpriseToolInvocation.find({
      status: "running",
      leaseExpiresAt: { $lt: nowIso },
    }).lean();
    const out: ToolInvocationRecord[] = [];
    for (const d of docs) {
      const updated = await EnterpriseToolInvocation.findOneAndUpdate(
        {
          invocationKey: d.invocationKey,
          status: "running",
          leaseExpiresAt: { $lt: nowIso },
        },
        {
          $set: {
            status: (d as { approval?: { decision?: string } }).approval?.decision === "approve"
              ? "authorized"
              : "pending",
            updatedAt: nowIso,
          },
          $unset: { claimedBy: 1, leaseExpiresAt: 1 },
        },
        { new: true }
      ).lean();
      if (updated) out.push(toRecord(updated as Record<string, unknown>));
    }
    return out;
  }

  async complete(
    invocationKey: string,
    result: ToolExecutionResult,
    nowIso: string
  ): Promise<ToolInvocationRecord | undefined> {
    const doc = await EnterpriseToolInvocation.findOneAndUpdate(
      { invocationKey },
      {
        $set: {
          status: result.status,
          result,
          errorCategory: result.error?.category,
          updatedAt: nowIso,
          completedAt: nowIso,
        },
        $unset: { claimedBy: 1, leaseExpiresAt: 1 },
      },
      { new: true }
    ).lean();
    return doc ? toRecord(doc as Record<string, unknown>) : undefined;
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
    await MongoToolInvocationStore.ensureIndexes();
    const existing = await this.get(input.invocationKey);
    if (!existing) return { ok: false, code: "NOT_FOUND", message: "Invocation not found" };
    if (existing.organizationId !== input.organizationId) {
      return { ok: false, code: "TENANT_ISOLATION", message: "Cross-tenant approval denied" };
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

    const nextStatus = input.decision.decision === "approve" ? "authorized" : "denied";
    const doc = await EnterpriseToolInvocation.findOneAndUpdate(
      {
        invocationKey: input.invocationKey,
        organizationId: input.organizationId,
        approval: { $exists: false },
        status: "awaiting_approval",
      },
      {
        $set: {
          approval: input.decision,
          status: nextStatus,
          updatedAt: input.decision.decidedAt,
          ...(input.decision.decision === "reject"
            ? { completedAt: input.decision.decidedAt }
            : {}),
        },
      },
      { new: true }
    ).lean();

    if (!doc) {
      const again = await this.get(input.invocationKey);
      if (again?.approval?.decision === input.decision.decision) {
        return { ok: true, record: again, duplicate: true };
      }
      return {
        ok: false,
        code: "APPROVAL_CONFLICT",
        message: "Approval race lost",
      };
    }
    return { ok: true, record: toRecord(doc as Record<string, unknown>), duplicate: false };
  }

  async tryClaimApproved(input: {
    readonly invocationKey: string;
    readonly workerId: string;
    readonly nowIso: string;
    readonly leaseMs?: number;
  }): Promise<{ readonly claimed: boolean; readonly record: ToolInvocationRecord | undefined }> {
    await MongoToolInvocationStore.ensureIndexes();
    const leaseMs = input.leaseMs ?? 30_000;
    const leaseExpiresAt = new Date(Date.parse(input.nowIso) + leaseMs).toISOString();
    const doc = await EnterpriseToolInvocation.findOneAndUpdate(
      {
        invocationKey: input.invocationKey,
        "approval.decision": "approve",
        result: { $exists: false },
        $or: [
          { status: "authorized" },
          { status: "pending" },
          { status: "running", leaseExpiresAt: { $lt: input.nowIso } },
          { claimedBy: { $exists: false } },
        ],
      },
      {
        $set: {
          status: "running",
          claimedBy: input.workerId,
          leaseExpiresAt,
          updatedAt: input.nowIso,
        },
      },
      { new: true }
    ).lean();
    if (doc) return { claimed: true, record: toRecord(doc as Record<string, unknown>) };
    const existing = await this.get(input.invocationKey);
    return { claimed: false, record: existing };
  }

  async updateCheckpoint(
    invocationKey: string,
    checkpoint: ToolContinuationCheckpoint,
    nowIso: string
  ): Promise<void> {
    await EnterpriseToolInvocation.updateOne(
      { invocationKey },
      { $set: { checkpoint, updatedAt: nowIso } }
    );
  }
}
