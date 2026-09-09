import { Schema, model, type Document } from "mongoose";
import type { AIUsageRecord } from "../../../../accounting/contracts/ai-usage-record";

export type AIUsageRecordDoc = Document & AIUsageRecord;

const appliedUnitPriceSchema = new Schema(
  {
    unit: { type: String, required: true },
    pricePerUnit: { type: String, required: true },
    quantity: { type: Number, required: true },
    costUsd: { type: String, required: true },
  },
  { _id: false }
);

const costBreakdownSchema = new Schema(
  {
    estimatedInputCostUsd: String,
    estimatedOutputCostUsd: String,
    estimatedCachedCostUsd: String,
    estimatedReasoningCostUsd: String,
    estimatedOtherCostUsd: String,
    estimatedTotalCostUsd: String,
    originalCurrency: { type: String, required: true },
    originalAmount: String,
    reportingCurrency: { type: String, required: true },
    reportingAmountUsd: String,
    exchangeRate: String,
    exchangeRateVersion: String,
    exchangeRateTimestamp: String,
    costStatus: { type: String, required: true, index: true },
    pricingVersion: String,
    pricingEffectiveAt: String,
    calculationVersion: { type: String, required: true },
    unitPricesApplied: [appliedUnitPriceSchema],
  },
  { _id: false }
);

const usageSchema = new Schema(
  {
    inputTokens: Number,
    outputTokens: Number,
    cachedInputTokens: Number,
    cachedOutputTokens: Number,
    reasoningTokens: Number,
    totalTokens: Number,
    otherUnits: [
      {
        unit: String,
        quantity: Number,
      },
    ],
    providerRequestId: String,
    rawProviderUsage: Schema.Types.Mixed,
  },
  { _id: false }
);

const aiUsageRecordSchema = new Schema(
  {
    usageRecordId: { type: String, required: true, unique: true, index: true },
    idempotencyKey: { type: String, required: true, unique: true, index: true },
    providerId: { type: String, required: true, index: true },
    providerAccount: String,
    modelId: { type: String, required: true, index: true },
    internalRequestId: { type: String, required: true },
    providerRequestId: { type: String, index: true, sparse: true },
    executionId: { type: String, required: true, index: true },
    jobId: { type: String, index: true, sparse: true },
    attemptId: { type: String, index: true, sparse: true },
    operationId: { type: String, index: true, sparse: true },
    correlationId: { type: String, index: true, sparse: true },
    organizationId: { type: String, required: true, index: true },
    workspaceId: { type: String, index: true, sparse: true },
    userId: { type: String, index: true, sparse: true },
    service: { type: String, index: true, sparse: true },
    operation: String,
    capabilityId: { type: String, required: true, index: true },
    startedAt: String,
    completedAt: { type: String, required: true, index: true },
    createdAt: { type: String, required: true, index: true },
    latencyMs: Number,
    invocationStatus: { type: String, required: true, index: true },
    retryCount: { type: Number, required: true, default: 0 },
    usage: { type: usageSchema, required: true },
    cost: { type: costBreakdownSchema, required: true },
    actualProviderCostUsd: String,
    billingPeriod: { type: String, required: true, index: true },
    rawProviderUsage: Schema.Types.Mixed,
    providerJobId: { type: String, index: true, sparse: true },
    accountingState: { type: String, index: true, sparse: true },
    updatedAt: { type: String, index: true, sparse: true },
  },
  { collection: "ai_usage_records" }
);

aiUsageRecordSchema.index({ providerId: 1, billingPeriod: 1 });
aiUsageRecordSchema.index({ organizationId: 1, billingPeriod: 1 });
aiUsageRecordSchema.index({ createdAt: 1, costStatus: 1 });

export const AIUsageRecordModel = model("AIUsageRecord", aiUsageRecordSchema);
