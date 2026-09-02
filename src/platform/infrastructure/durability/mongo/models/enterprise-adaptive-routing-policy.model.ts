import { Schema, model, type Document } from "mongoose";
import type { AdaptiveRoutingPolicy } from "../../../../providers/routing/performance/benchmark/adaptive/routing-policy-contract";

export type EnterpriseAdaptiveRoutingPolicyDoc = Document & AdaptiveRoutingPolicy;

const enterpriseAdaptiveRoutingPolicySchema = new Schema(
  {
    policyId: { type: String, required: true, unique: true, index: true },
    policyVersion: { type: String, required: true },
    lifecycle: { type: String, required: true, index: true },
    enabled: { type: Boolean, required: true, index: true },
    scope: {
      service: { type: String, index: true },
      subtype: String,
      industry: { type: String, index: true },
      platform: String,
      format: String,
    },
    candidate: {
      providerId: { type: String, required: true },
      modelId: { type: String, required: true },
      strategyId: String,
      strategyVersion: String,
      knowledgeId: String,
      knowledgeVersion: String,
      knowledgeFingerprint: String,
    },
    promotionCandidateId: { type: String, required: true, index: true },
    rolloutPercentage: { type: Number, required: true },
    minimumConfidence: { type: String, required: true },
    minimumSamples: { type: Number, required: true },
    maxCostIncrease: { type: Number, required: true },
    maxLatencyIncrease: { type: Number, required: true },
    maxReliabilityRegression: { type: Number, required: true },
    maxQualityRegression: { type: Number, required: true },
    createdAt: { type: String, required: true },
    approvedAt: String,
    approvedBy: String,
    activatedAt: String,
    expiresAt: { type: String, index: true },
    pausedAt: String,
    pauseReason: String,
  },
  { collection: "enterprise_adaptive_routing_policies" },
);

enterpriseAdaptiveRoutingPolicySchema.index({
  lifecycle: 1,
  enabled: 1,
  "scope.service": 1,
  "scope.industry": 1,
});

export const EnterpriseAdaptiveRoutingPolicy = model(
  "EnterpriseAdaptiveRoutingPolicy",
  enterpriseAdaptiveRoutingPolicySchema,
);
