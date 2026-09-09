import { Schema, model } from "mongoose";

export interface ProviderBillingSyncStateDoc {
  readonly providerId: string;
  readonly providerAccount: string | null;
  readonly lastSuccessfulSyncAt: string | null;
  readonly providerDataThrough: string | null;
  readonly syncStatus: string;
  readonly syncError: string | null;
  readonly updatedAt: string;
}

const providerBillingSyncStateSchema = new Schema(
  {
    providerId: { type: String, required: true, index: true },
    providerAccount: { type: String, default: null },
    lastSuccessfulSyncAt: String,
    providerDataThrough: String,
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
