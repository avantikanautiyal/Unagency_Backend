/**
 * Persistent AI usage ledger with idempotent writes.
 */

import { randomUUID } from "crypto";
import type { AIUsageRecord, CreateAIUsageRecordInput } from "../contracts/ai-usage-record";
import { billingPeriodBoundsForDate } from "../contracts/billing-period";
import { aggregateEligibleRecords } from "../eligibility/accounting-eligibility";
import { AIUsageRecordModel } from "../../infrastructure/durability/mongo/models/ai-usage-record.model";

export interface RecordUsageResult {
  readonly record: AIUsageRecord;
  readonly created: boolean;
}

export interface IUsageLedger {
  recordUsage(input: CreateAIUsageRecordInput): Promise<RecordUsageResult>;
  findByIdempotencyKey(key: string): Promise<AIUsageRecord | null>;
  findByProviderRequestId(providerId: string, providerRequestId: string): Promise<AIUsageRecord | null>;
  findPendingByOperationId(operationId: string): Promise<AIUsageRecord | null>;
  getByUsageRecordId(usageRecordId: string): Promise<AIUsageRecord | null>;
  updateUsageRecord(
    usageRecordId: string,
    patch: UsageRecordUpdatePatch
  ): Promise<boolean>;
  listByExecutionId(executionId: string): Promise<readonly AIUsageRecord[]>;
  listRecords(filter: UsageAggregateFilter): Promise<readonly AIUsageRecord[]>;
  aggregateSpend(filter: UsageAggregateFilter): Promise<UsageAggregateResult>;
  lastUsageUpdateAt(): Promise<string | null>;
}

export interface UsageRecordUpdatePatch {
  readonly usage?: AIUsageRecord["usage"];
  readonly cost?: AIUsageRecord["cost"];
  readonly invocationStatus?: AIUsageRecord["invocationStatus"];
  readonly completedAt?: string;
  readonly providerRequestId?: string | null;
  readonly latencyMs?: number | null;
  readonly providerJobId?: string | null;
  readonly accountingState?: string;
}

export interface UsageAggregateFilter {
  readonly start: Date;
  readonly end: Date;
  readonly organizationId?: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly service?: string;
  readonly executionId?: string;
}

export interface UsageAggregateResult {
  readonly liveInternalSpendUsd: string | null;
  readonly pendingSpendUsd: string | null;
  readonly requestCount: number;
  readonly successfulRequestCount: number;
  readonly failedRequestCount: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedTokens: number;
  readonly reasoningTokens: number;
}

export class MongoUsageLedger implements IUsageLedger {
  async recordUsage(input: CreateAIUsageRecordInput): Promise<RecordUsageResult> {
    const existing = await this.findByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      return { record: existing, created: false };
    }

    const completedAt = input.completedAt;
    const billingPeriod = billingPeriodBoundsForDate(new Date(completedAt)).billingPeriod;
    const usageRecordId = `usage_${randomUUID()}`;
    const createdAt = new Date().toISOString();

    const record: AIUsageRecord = {
      usageRecordId,
      idempotencyKey: input.idempotencyKey,
      providerId: input.providerId,
      providerAccount: input.providerAccount ?? null,
      modelId: input.modelId,
      internalRequestId: input.internalRequestId,
      providerRequestId: input.providerRequestId ?? input.usage.providerRequestId ?? null,
      executionId: input.executionId,
      jobId: input.jobId ?? null,
      attemptId: input.attemptId ?? null,
      operationId: input.operationId ?? null,
      correlationId: input.correlationId ?? null,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId ?? null,
      userId: input.userId ?? null,
      service: input.service ?? null,
      operation: input.operation ?? null,
      capabilityId: input.capabilityId,
      startedAt: input.startedAt ?? null,
      completedAt,
      createdAt,
      latencyMs: input.latencyMs ?? null,
      invocationStatus: input.invocationStatus,
      retryCount: input.retryCount ?? 0,
      usage: input.usage,
      cost: input.cost,
      actualProviderCostUsd: input.actualProviderCostUsd ?? null,
      billingPeriod,
      rawProviderUsage: input.usage.rawProviderUsage,
    };

    try {
      await AIUsageRecordModel.create(record);
      return { record, created: true };
    } catch (error) {
      const duplicate =
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: number }).code === 11000;
      if (duplicate) {
        const raced = await this.findByIdempotencyKey(input.idempotencyKey);
        if (raced) return { record: raced, created: false };
      }
      throw error;
    }
  }

  async findByIdempotencyKey(key: string): Promise<AIUsageRecord | null> {
    const doc = await AIUsageRecordModel.findOne({ idempotencyKey: key }).lean();
    return doc ? (doc as unknown as AIUsageRecord) : null;
  }

  async findByProviderRequestId(
    providerId: string,
    providerRequestId: string
  ): Promise<AIUsageRecord | null> {
    const key = `${providerId}:${providerRequestId}`;
    const byKey = await this.findByIdempotencyKey(key);
    if (byKey) return byKey;
    const doc = await AIUsageRecordModel.findOne({ providerId, providerRequestId }).lean();
    return doc ? (doc as unknown as AIUsageRecord) : null;
  }

  async findPendingByOperationId(operationId: string): Promise<AIUsageRecord | null> {
    const doc = await AIUsageRecordModel.findOne({
      operationId,
      "cost.costStatus": "PENDING_PROVIDER_USAGE",
    }).lean();
    return doc ? (doc as unknown as AIUsageRecord) : null;
  }

  async getByUsageRecordId(usageRecordId: string): Promise<AIUsageRecord | null> {
    const doc = await AIUsageRecordModel.findOne({ usageRecordId }).lean();
    return doc ? (doc as unknown as AIUsageRecord) : null;
  }

  async updateUsageRecord(
    usageRecordId: string,
    patch: UsageRecordUpdatePatch
  ): Promise<boolean> {
    const updatedAt = new Date().toISOString();
    const result = await AIUsageRecordModel.updateOne(
      { usageRecordId },
      {
        $set: {
          ...(patch.usage ? { usage: patch.usage, rawProviderUsage: patch.usage.rawProviderUsage } : {}),
          ...(patch.cost ? { cost: patch.cost } : {}),
          ...(patch.invocationStatus ? { invocationStatus: patch.invocationStatus } : {}),
          ...(patch.completedAt ? { completedAt: patch.completedAt } : {}),
          ...(patch.providerRequestId !== undefined
            ? { providerRequestId: patch.providerRequestId }
            : {}),
          ...(patch.latencyMs !== undefined ? { latencyMs: patch.latencyMs } : {}),
          ...(patch.providerJobId !== undefined ? { providerJobId: patch.providerJobId } : {}),
          ...(patch.accountingState ? { accountingState: patch.accountingState } : {}),
          updatedAt,
        },
      }
    );
    return result.modifiedCount > 0;
  }

  async listRecords(filter: UsageAggregateFilter): Promise<readonly AIUsageRecord[]> {
    const match: Record<string, unknown> = {
      completedAt: {
        $gte: filter.start.toISOString(),
        $lt: filter.end.toISOString(),
      },
    };
    if (filter.organizationId) match.organizationId = filter.organizationId;
    if (filter.providerId) match.providerId = filter.providerId;
    if (filter.modelId) match.modelId = filter.modelId;
    if (filter.service) match.service = filter.service;
    if (filter.executionId) match.executionId = filter.executionId;
    const docs = await AIUsageRecordModel.find(match).sort({ completedAt: -1 }).lean();
    return docs as unknown as AIUsageRecord[];
  }

  async listByExecutionId(executionId: string): Promise<readonly AIUsageRecord[]> {
    const docs = await AIUsageRecordModel.find({ executionId })
      .sort({ completedAt: 1 })
      .lean();
    return docs as unknown as AIUsageRecord[];
  }

  async aggregateSpend(filter: UsageAggregateFilter): Promise<UsageAggregateResult> {
    const records = await this.listRecords(filter);
    const totals = aggregateEligibleRecords(records, filter);
    return {
      liveInternalSpendUsd: totals.liveInternalSpendUsd,
      pendingSpendUsd: totals.pendingSpendUsd,
      requestCount: totals.requestCount,
      successfulRequestCount: totals.successfulRequestCount,
      failedRequestCount: totals.failedRequestCount,
      inputTokens: totals.inputTokens,
      outputTokens: totals.outputTokens,
      cachedTokens: totals.cachedTokens,
      reasoningTokens: totals.reasoningTokens,
    };
  }

  async lastUsageUpdateAt(): Promise<string | null> {
    const [latestCreated, latestUpdated] = await Promise.all([
      AIUsageRecordModel.findOne().sort({ createdAt: -1 }).lean(),
      AIUsageRecordModel.findOne({ updatedAt: { $exists: true, $ne: null } })
        .sort({ updatedAt: -1 })
        .lean(),
    ]);
    const createdAt = latestCreated
      ? String((latestCreated as { createdAt?: string }).createdAt ?? "")
      : null;
    const updatedAt = latestUpdated
      ? String((latestUpdated as { updatedAt?: string }).updatedAt ?? "")
      : null;
    if (createdAt && updatedAt) {
      return Date.parse(updatedAt) > Date.parse(createdAt) ? updatedAt : createdAt;
    }
    return updatedAt ?? createdAt;
  }
}

export class InMemoryUsageLedger implements IUsageLedger {
  private readonly records = new Map<string, AIUsageRecord>();

  async recordUsage(input: CreateAIUsageRecordInput): Promise<RecordUsageResult> {
    const existing = await this.findByIdempotencyKey(input.idempotencyKey);
    if (existing) return { record: existing, created: false };

    const completedAt = input.completedAt;
    const billingPeriod = billingPeriodBoundsForDate(new Date(completedAt)).billingPeriod;
    const record: AIUsageRecord = {
      usageRecordId: `usage_${randomUUID()}`,
      idempotencyKey: input.idempotencyKey,
      providerId: input.providerId,
      providerAccount: input.providerAccount ?? null,
      modelId: input.modelId,
      internalRequestId: input.internalRequestId,
      providerRequestId: input.providerRequestId ?? input.usage.providerRequestId ?? null,
      executionId: input.executionId,
      jobId: input.jobId ?? null,
      attemptId: input.attemptId ?? null,
      operationId: input.operationId ?? null,
      correlationId: input.correlationId ?? null,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId ?? null,
      userId: input.userId ?? null,
      service: input.service ?? null,
      operation: input.operation ?? null,
      capabilityId: input.capabilityId,
      startedAt: input.startedAt ?? null,
      completedAt,
      createdAt: new Date().toISOString(),
      latencyMs: input.latencyMs ?? null,
      invocationStatus: input.invocationStatus,
      retryCount: input.retryCount ?? 0,
      usage: input.usage,
      cost: input.cost,
      actualProviderCostUsd: input.actualProviderCostUsd ?? null,
      billingPeriod,
      rawProviderUsage: input.usage.rawProviderUsage,
    };

    this.records.set(input.idempotencyKey, record);
    return { record, created: true };
  }

  async findByIdempotencyKey(key: string): Promise<AIUsageRecord | null> {
    return this.records.get(key) ?? null;
  }

  async findByProviderRequestId(
    providerId: string,
    providerRequestId: string
  ): Promise<AIUsageRecord | null> {
    const key = `${providerId}:${providerRequestId}`;
    return this.findByIdempotencyKey(key).then(async (byKey) => {
      if (byKey) return byKey;
      return (
        [...this.records.values()].find(
          (r) => r.providerId === providerId && r.providerRequestId === providerRequestId
        ) ?? null
      );
    });
  }

  async findPendingByOperationId(operationId: string): Promise<AIUsageRecord | null> {
    return (
      [...this.records.values()].find(
        (r) => r.operationId === operationId && r.cost.costStatus === "PENDING_PROVIDER_USAGE"
      ) ?? null
    );
  }

  async getByUsageRecordId(usageRecordId: string): Promise<AIUsageRecord | null> {
    return [...this.records.values()].find((r) => r.usageRecordId === usageRecordId) ?? null;
  }

  async updateUsageRecord(
    usageRecordId: string,
    patch: UsageRecordUpdatePatch
  ): Promise<boolean> {
    const record = await this.getByUsageRecordId(usageRecordId);
    if (!record) return false;
    const updated: AIUsageRecord = {
      ...record,
      ...(patch.usage ? { usage: patch.usage, rawProviderUsage: patch.usage.rawProviderUsage } : {}),
      ...(patch.cost ? { cost: patch.cost } : {}),
      ...(patch.invocationStatus ? { invocationStatus: patch.invocationStatus } : {}),
      ...(patch.completedAt ? { completedAt: patch.completedAt } : {}),
      ...(patch.providerRequestId !== undefined
        ? { providerRequestId: patch.providerRequestId }
        : {}),
      ...(patch.latencyMs !== undefined ? { latencyMs: patch.latencyMs } : {}),
    };
    this.records.set(record.idempotencyKey, updated);
    return true;
  }

  async listRecords(filter: UsageAggregateFilter): Promise<readonly AIUsageRecord[]> {
    return [...this.records.values()].filter((record) => {
      const completed = Date.parse(record.completedAt);
      if (completed < filter.start.getTime() || completed >= filter.end.getTime()) return false;
      if (filter.organizationId && record.organizationId !== filter.organizationId) return false;
      if (filter.providerId && record.providerId !== filter.providerId) return false;
      if (filter.modelId && record.modelId !== filter.modelId) return false;
      if (filter.service && record.service !== filter.service) return false;
      if (filter.executionId && record.executionId !== filter.executionId) return false;
      return true;
    });
  }

  async listByExecutionId(executionId: string): Promise<readonly AIUsageRecord[]> {
    return [...this.records.values()].filter((r) => r.executionId === executionId);
  }

  async aggregateSpend(filter: UsageAggregateFilter): Promise<UsageAggregateResult> {
    const records = await this.listRecords(filter);
    const totals = aggregateEligibleRecords(records, filter);
    return {
      liveInternalSpendUsd: totals.liveInternalSpendUsd,
      pendingSpendUsd: totals.pendingSpendUsd,
      requestCount: totals.requestCount,
      successfulRequestCount: totals.successfulRequestCount,
      failedRequestCount: totals.failedRequestCount,
      inputTokens: totals.inputTokens,
      outputTokens: totals.outputTokens,
      cachedTokens: totals.cachedTokens,
      reasoningTokens: totals.reasoningTokens,
    };
  }

  async lastUsageUpdateAt(): Promise<string | null> {
    const sorted = [...this.records.values()].sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
    );
    return sorted[0]?.createdAt ?? null;
  }
}
