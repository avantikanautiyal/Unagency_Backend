/**
 * Persistent AI usage ledger with idempotent writes.
 */

import { randomUUID } from "crypto";
import type { AIUsageRecord, CreateAIUsageRecordInput } from "../contracts/ai-usage-record";
import { billingPeriodBoundsForDate } from "../contracts/billing-period";
import { AIUsageRecordModel } from "../../infrastructure/durability/mongo/models/ai-usage-record.model";

export interface RecordUsageResult {
  readonly record: AIUsageRecord;
  readonly created: boolean;
}

export interface IUsageLedger {
  recordUsage(input: CreateAIUsageRecordInput): Promise<RecordUsageResult>;
  findByIdempotencyKey(key: string): Promise<AIUsageRecord | null>;
  listByExecutionId(executionId: string): Promise<readonly AIUsageRecord[]>;
  aggregateSpend(filter: UsageAggregateFilter): Promise<UsageAggregateResult>;
  lastUsageUpdateAt(): Promise<string | null>;
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

  async listByExecutionId(executionId: string): Promise<readonly AIUsageRecord[]> {
    const docs = await AIUsageRecordModel.find({ executionId })
      .sort({ completedAt: 1 })
      .lean();
    return docs as unknown as AIUsageRecord[];
  }

  async aggregateSpend(filter: UsageAggregateFilter): Promise<UsageAggregateResult> {
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

    const docs = await AIUsageRecordModel.find(match).lean();
    const records = docs as unknown as AIUsageRecord[];

    let liveMicro = BigInt(0);
    let pendingMicro = BigInt(0);
    let requestCount = 0;
    let successfulRequestCount = 0;
    let failedRequestCount = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let cachedTokens = 0;
    let reasoningTokens = 0;

    const { parseUsdToMicro, microToUsdString } = await import("../money/usd-money");
    const { isCostKnown, isCostPending } = await import("../contracts/ai-usage-record");

    for (const record of records) {
      requestCount += 1;
      if (record.invocationStatus === "SUCCEEDED") successfulRequestCount += 1;
      else failedRequestCount += 1;

      inputTokens += record.usage.inputTokens ?? 0;
      outputTokens += record.usage.outputTokens ?? 0;
      cachedTokens += (record.usage.cachedInputTokens ?? 0) + (record.usage.cachedOutputTokens ?? 0);
      reasoningTokens += record.usage.reasoningTokens ?? 0;

      const amount =
        record.cost.reportingAmountUsd ?? record.cost.estimatedTotalCostUsd;
      const micro = parseUsdToMicro(amount);
      if (micro == null) continue;

      if (isCostKnown(record.cost.costStatus)) {
        liveMicro += micro;
      } else if (isCostPending(record.cost.costStatus)) {
        pendingMicro += micro;
      }
    }

    return {
      liveInternalSpendUsd: requestCount > 0 && liveMicro > BigInt(0) ? microToUsdString(liveMicro) : liveMicro === BigInt(0) ? (requestCount > 0 ? "0" : null) : microToUsdString(liveMicro),
      pendingSpendUsd: pendingMicro > BigInt(0) ? microToUsdString(pendingMicro) : null,
      requestCount,
      successfulRequestCount,
      failedRequestCount,
      inputTokens,
      outputTokens,
      cachedTokens,
      reasoningTokens,
    };
  }

  async lastUsageUpdateAt(): Promise<string | null> {
    const doc = await AIUsageRecordModel.findOne().sort({ createdAt: -1 }).lean();
    return doc ? String((doc as { createdAt?: string }).createdAt ?? "") : null;
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

  async listByExecutionId(executionId: string): Promise<readonly AIUsageRecord[]> {
    return [...this.records.values()].filter((r) => r.executionId === executionId);
  }

  async aggregateSpend(filter: UsageAggregateFilter): Promise<UsageAggregateResult> {
    const mongo = new MongoUsageLedger();
    const records = [...this.records.values()].filter((record) => {
      const completed = Date.parse(record.completedAt);
      if (completed < filter.start.getTime() || completed >= filter.end.getTime()) return false;
      if (filter.organizationId && record.organizationId !== filter.organizationId) return false;
      if (filter.providerId && record.providerId !== filter.providerId) return false;
      if (filter.modelId && record.modelId !== filter.modelId) return false;
      if (filter.service && record.service !== filter.service) return false;
      if (filter.executionId && record.executionId !== filter.executionId) return false;
      return true;
    });

    const { parseUsdToMicro, microToUsdString } = await import("../money/usd-money");
    const { isCostKnown, isCostPending } = await import("../contracts/ai-usage-record");

    let liveMicro = BigInt(0);
    let pendingMicro = BigInt(0);
    let requestCount = records.length;
    let successfulRequestCount = 0;
    let failedRequestCount = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let cachedTokens = 0;
    let reasoningTokens = 0;

    for (const record of records) {
      if (record.invocationStatus === "SUCCEEDED") successfulRequestCount += 1;
      else failedRequestCount += 1;
      inputTokens += record.usage.inputTokens ?? 0;
      outputTokens += record.usage.outputTokens ?? 0;
      cachedTokens += (record.usage.cachedInputTokens ?? 0) + (record.usage.cachedOutputTokens ?? 0);
      reasoningTokens += record.usage.reasoningTokens ?? 0;
      const amount = record.cost.reportingAmountUsd ?? record.cost.estimatedTotalCostUsd;
      const micro = parseUsdToMicro(amount);
      if (micro == null) continue;
      if (isCostKnown(record.cost.costStatus)) liveMicro += micro;
      else if (isCostPending(record.cost.costStatus)) pendingMicro += micro;
    }

    return {
      liveInternalSpendUsd:
        requestCount > 0 && liveMicro > BigInt(0)
          ? microToUsdString(liveMicro)
          : liveMicro === BigInt(0)
            ? requestCount > 0
              ? "0"
              : null
            : microToUsdString(liveMicro),
      pendingSpendUsd: pendingMicro > BigInt(0) ? microToUsdString(pendingMicro) : null,
      requestCount,
      successfulRequestCount,
      failedRequestCount,
      inputTokens,
      outputTokens,
      cachedTokens,
      reasoningTokens,
    };
  }

  async lastUsageUpdateAt(): Promise<string | null> {
    const sorted = [...this.records.values()].sort((a, b) =>
      Date.parse(b.createdAt) - Date.parse(a.createdAt)
    );
    return sorted[0]?.createdAt ?? null;
  }
}
