import { Schema, model } from "mongoose";
import type { AIModelPricingRecord } from "../../../../accounting/contracts/ai-model-pricing";

const unitRateSchema = new Schema(
  {
    unit: { type: String, required: true },
    pricePerUnit: { type: String, required: true },
    currency: { type: String, required: true },
  },
  { _id: false }
);

const aiModelPricingSchema = new Schema(
  {
    pricingId: { type: String, required: true, unique: true, index: true },
    providerId: { type: String, required: true, index: true },
    modelId: { type: String, required: true, index: true },
    pricingVersion: { type: String, required: true, index: true },
    effectiveFrom: { type: String, required: true, index: true },
    effectiveTo: { type: String, index: true, sparse: true },
    unitRates: [unitRateSchema],
    currency: { type: String, required: true },
    active: { type: Boolean, required: true, default: true, index: true },
    requiresConfiguration: { type: Boolean, required: true, default: false },
    source: { type: String, required: true },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { collection: "ai_model_pricing" }
);

aiModelPricingSchema.index({ providerId: 1, modelId: 1, effectiveFrom: -1 });

export const AIModelPricingModel = model<AIModelPricingRecord>(
  "AIModelPricing",
  aiModelPricingSchema
);
