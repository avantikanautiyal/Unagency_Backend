import { Schema, model } from "mongoose";

const providerBillingSyncStateSchema = new Schema(
  {
    providerId: { type: String, required: true, index: true },
    providerAccount: { type: String, default: null },
    lastSuccessfulSyncAt: String,
    providerDataThrough: String,
    providerDataFrom: String,
    syncStatus: { type: String, required: true, index: true },
    syncError: String,
    updatedAt: { type: String, required: true },
  },
  { collection: "ai_provider_billing_sync_state" }
);

providerBillingSyncStateSchema.index(
  { providerId: 1, providerAccount: 1 },
  { unique: true }
);

export const ProviderBillingSyncStateModel = model(
  "ProviderBillingSyncState",
  providerBillingSyncStateSchema
);
