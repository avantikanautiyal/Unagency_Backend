import { Schema, model, type Document } from "mongoose";
import type { DurableExecutionObservabilityRecord } from "../../../../os/observability/execution-observability-contract";

export type EnterpriseExecutionObservabilityDoc = Document &
  DurableExecutionObservabilityRecord;

const enterpriseExecutionObservabilitySchema = new Schema(
  {
    recordKind: { type: String, required: true },
    executionId: { type: String, required: true, unique: true, index: true },
    correlationId: { type: String, required: true, index: true },
    organizationId: { type: String, required: true, index: true },
    service: { type: String, required: true, index: true },
    subtype: { type: String, required: true, index: true },
    outputKind: { type: String, index: true },
    capabilityId: { type: String, index: true, sparse: true },
    requestedProviderId: { type: String, index: true, sparse: true },
    requestedModelId: { type: String, sparse: true },
    selectedProviderId: { type: String, index: true, sparse: true },
    selectedModelId: { type: String, sparse: true },
    actualProviderId: { type: String, index: true, sparse: true },
    actualModelId: { type: String, index: true, sparse: true },
    fallbackUsed: { type: Boolean, required: true },
    fallbackReason: String,
    classificationStatus: { type: String, required: true },
    routingMode: { type: String, sparse: true },
    adaptiveRoutingEnabled: Boolean,
    routingDecision: String,
    structuredOutputStatus: { type: String, required: true },
    materializationStatus: { type: String, required: true },
    artifactPersistenceStatus: { type: String, required: true },
    artifactHydrationStatus: { type: String, required: true },
    artifactRenderStatus: { type: String, required: true },
    runtimeEvaluationStatus: { type: String, required: true },
    evaluationPlaneStatus: { type: String, required: true, index: true },
    evaluationPlaneVersion: String,
    step2Status: { type: String, required: true, index: true },
    qualityGateStatus: { type: String, required: true },
    evidenceStatus: { type: String, required: true, index: true },
    performanceRecordStatus: { type: String, required: true },
    artifactIds: [String],
    artifactType: String,
    performanceRecordId: { type: String, index: true, sparse: true },
    evidenceSource: String,
    evidenceMode: String,
    executionStatus: { type: String, index: true, sparse: true },
    finalOutcome: String,
    contractValidationStatus: String,
    qualityScore: Number,
    integrityStatus: { type: String, required: true, index: true },
    failureCategory: { type: String, index: true, sparse: true },
    failureReason: String,
    integrityFailures: [String],
    stages: Schema.Types.Mixed,
    startedAt: { type: String, required: true, index: true },
    finalizedAt: { type: String, required: true, index: true },
    durationMs: Number,
    latencyMs: Number,
    persistedAt: { type: String, required: true },
  },
  { collection: "enterprise_execution_observability" },
);

enterpriseExecutionObservabilitySchema.index({
  organizationId: 1,
  finalizedAt: -1,
});

enterpriseExecutionObservabilitySchema.index({
  service: 1,
  subtype: 1,
  finalizedAt: -1,
});

enterpriseExecutionObservabilitySchema.index({
  actualProviderId: 1,
  actualModelId: 1,
  finalizedAt: -1,
});

enterpriseExecutionObservabilitySchema.index({
  integrityStatus: 1,
  failureCategory: 1,
  finalizedAt: -1,
});

export const EnterpriseExecutionObservability = model(
  "EnterpriseExecutionObservability",
  enterpriseExecutionObservabilitySchema,
);
