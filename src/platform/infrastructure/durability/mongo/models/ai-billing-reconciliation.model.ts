import { Schema, model } from "mongoose";
import type { AIBillingReconciliationRecord } from "../../../../accounting/contracts/billing-reconciliation";

const aiBillingReconciliationSchema = new Schema(
  {
    reconciliationId: { type: String, required: true, unique: true, index: true },
    providerId: { type: String, required: true, index: true },
    providerAccount: String,
    providerBillingPeriod: { type: String, required: true, index: true },
    agencyBillingPeriod: { type: String, required: true, index: true },
    providerUsageId: { type: String, index: true, sparse: true },
    providerRequestId: { type: String, index: true, sparse: true },
    usageRecordId: { type: String, index: true, sparse: true },
    providerAmount: String,
    providerCurrency: String,
    internalAmountUsd: String,
    varianceAmountUsd: String,
    variancePercentage: String,
    matchedUsageCount: { type: Number, required: true, default: 0 },
    unmatchedUsageCount: { type: Number, required: true, default: 0 },
    status: { type: String, required: true, index: true },
    providerDataThrough: String,
    syncedAt: { type: String, required: true },
    reconciliationReason: String,
    isAggregate: { type: Boolean, required: true, default: false },
  },
  { collection: "ai_billing_reconciliation" }
);

export const AIBillingReconciliationModel = model<AIBillingReconciliationRecord>(
  "AIBillingReconciliation",
  aiBillingReconciliationSchema
);
