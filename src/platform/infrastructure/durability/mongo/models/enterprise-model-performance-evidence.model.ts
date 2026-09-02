import { Schema, model, type Document } from "mongoose";
import type { PerformanceEvidence } from "../../../../providers/routing/performance/contracts/performance-evidence";

export type EnterpriseModelPerformanceEvidenceDoc = Document & PerformanceEvidence;

const enterpriseModelPerformanceEvidenceSchema = new Schema(
  {
    evidenceId: { type: String, required: true, unique: true, index: true },
    executionId: { type: String, required: true, index: true },
    attemptId: { type: String, required: true, unique: true, index: true },
    organizationId: { type: String, required: true, index: true },
    capabilityId: { type: String, required: true, index: true },
    providerId: { type: String, required: true, index: true },
    modelId: { type: String, required: true, index: true },
    routingDecisionId: { type: String, index: true, sparse: true },
    positionInRoute: { type: Number, required: true },
    primaryOrFailover: { type: String, required: true },
    exploratory: Boolean,
    startedAt: { type: String, required: true },
    completedAt: { type: String, required: true, index: true },
    latencyMs: { type: Number, required: true },
    success: { type: Boolean, required: true, index: true },
    failureCategory: { type: String, required: true },
    evaluationScore: Number,
    evaluationDimensions: Schema.Types.Mixed,
    feedbackEligible: Boolean,
    evaluationTrust: String,
    evaluationMethod: String,
    evaluationStatus: String,
    judgeId: String,
    judgeVersion: String,
    rubricVersion: String,
    evaluationExclusionReason: String,
    evaluationMetricNamespace: String,
    inputTokens: Number,
    outputTokens: Number,
    totalTokens: Number,
    imagesGenerated: Number,
    videoSeconds: Number,
    computeUnits: Number,
    estimatedCost: { type: Number, default: null },
    costEligible: Boolean,
    costCurrency: String,
    pricingVersion: String,
    costStatus: String,
    costMethod: String,
    costTrust: String,
    retryCount: { type: Number, required: true, default: 0 },
    timeoutOccurred: { type: Boolean, required: true, default: false },
    rateLimited: { type: Boolean, required: true, default: false },
    artifactIds: [String],
    infrastructureFailure: Boolean,
    recordedAt: { type: String, required: true },
  },
  { collection: "enterprise_model_performance_evidence" }
);

enterpriseModelPerformanceEvidenceSchema.index({
  providerId: 1,
  modelId: 1,
  capabilityId: 1,
  completedAt: -1,
});
enterpriseModelPerformanceEvidenceSchema.index({
  organizationId: 1,
  providerId: 1,
  modelId: 1,
  completedAt: -1,
});
enterpriseModelPerformanceEvidenceSchema.index({
  organizationId: 1,
  capabilityId: 1,
  success: 1,
  completedAt: -1,
});

export const EnterpriseModelPerformanceEvidence = model(
  "EnterpriseModelPerformanceEvidence",
  enterpriseModelPerformanceEvidenceSchema
);
