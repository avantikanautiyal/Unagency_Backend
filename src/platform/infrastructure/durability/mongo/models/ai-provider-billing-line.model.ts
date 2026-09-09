import { Schema, model } from "mongoose";

export interface ProviderBillingLineDoc {
  readonly billingLineId: string;
  readonly idempotencyKey: string;
  readonly providerId: string;
  readonly providerAccount: string | null;
  readonly providerUsageId: string;
  readonly providerRequestId: string | null;
  readonly modelId: string | null;
  readonly amount: string;
  readonly currency: string;
  readonly bucketStart: string | null;
  readonly bucketEnd: string | null;
  readonly providerBillingPeriod: string;
  readonly syncedAt: string;
  readonly raw: Record<string, unknown> | null;
}

const providerBillingLineSchema = new Schema(
  {
    billingLineId: { type: String, required: true, unique: true, index: true },
    idempotencyKey: { type: String, required: true, unique: true, index: true },
    providerId: { type: String, required: true, index: true },
    providerAccount: String,
    providerUsageId: { type: String, required: true, index: true },
    providerRequestId: { type: String, index: true, sparse: true },
    modelId: { type: String, index: true, sparse: true },
    amount: { type: String, required: true },
    currency: { type: String, required: true },
    bucketStart: String,
    bucketEnd: String,
    providerBillingPeriod: { type: String, required: true, index: true },
    syncedAt: { type: String, required: true },
    raw: Schema.Types.Mixed,
  },
  { collection: "ai_provider_billing_lines" }
);

export const ProviderBillingLineModel = model(
  "ProviderBillingLine",
  providerBillingLineSchema
);
