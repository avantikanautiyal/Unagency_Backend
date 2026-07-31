import { Schema, model, type Document } from "mongoose";
import type { ProviderOperationRecord } from "../../../../intelligence/providers/async/contracts/provider-operation";

export type EnterpriseProviderOperationDoc = Document & ProviderOperationRecord & {
  usageRecorded?: boolean;
  version?: number;
};

const outputSchema = new Schema(
  {
    index: { type: Number, required: true },
    type: { type: String, required: true },
    mimeType: String,
    temporaryUrl: String,
    storageRef: String,
    metadata: Schema.Types.Mixed,
  },
  { _id: false }
);

const enterpriseProviderOperationSchema = new Schema(
  {
    operationId: { type: String, required: true, unique: true, index: true },
    submissionKey: { type: String, required: true, unique: true, index: true },
    executionId: { type: String, required: true, index: true },
    attemptId: { type: String, required: true },
    organizationId: { type: String, required: true, index: true },
    workspaceId: { type: String, required: true },
    providerId: { type: String, required: true, index: true },
    modelId: { type: String, required: true },
    capabilityId: { type: String, required: true },
    state: { type: String, required: true, index: true },
    providerJobId: { type: String, index: true, sparse: true },
    idempotencyKey: { type: String, required: true },
    submittedAt: String,
    lastPolledAt: String,
    nextPollAt: { type: String, index: true },
    pollCount: { type: Number, required: true, default: 0 },
    leaseOwner: { type: String, index: true, sparse: true },
    leaseExpiresAt: { type: String, index: true, sparse: true },
    terminalAt: String,
    outputs: [outputSchema],
    usage: Schema.Types.Mixed,
    errorCode: String,
    errorMessage: String,
    safeMetadata: Schema.Types.Mixed,
    artifactIds: [String],
    usageRecorded: { type: Boolean, default: false, index: true },
    version: { type: Number, default: 0 },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { collection: "enterprise_provider_operations" }
);

enterpriseProviderOperationSchema.index({ state: 1, nextPollAt: 1, leaseOwner: 1 });
enterpriseProviderOperationSchema.index({ leaseExpiresAt: 1, leaseOwner: 1 });

export const EnterpriseProviderOperation = model(
  "EnterpriseProviderOperation",
  enterpriseProviderOperationSchema
);
