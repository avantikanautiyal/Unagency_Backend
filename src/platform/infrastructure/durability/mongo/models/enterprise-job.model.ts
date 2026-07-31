import { Schema, model, type Document } from "mongoose";
import type { ExecutionJob } from "../../../execution/contracts/job";

export type EnterpriseJobDoc = Document & ExecutionJob;

const enterpriseJobSchema = new Schema(
  {
    jobId: { type: String, required: true, unique: true, index: true },
    queueKind: { type: String, required: true },
    status: { type: String, required: true, index: true },
    priority: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    attempt: { type: Number, required: true },
    maxAttempts: { type: Number, required: true },
    retryPolicy: { type: Schema.Types.Mixed, required: true },
    scheduledAt: String,
    reservedBy: String,
    reservationId: String,
    leaseId: String,
    leaseExpiresAt: String,
    batchId: String,
    progressPercent: { type: Number, required: true },
    currentStage: String,
    currentProvider: String,
    estimatedCompletionAt: String,
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
    startedAt: String,
    completedAt: String,
    lastError: String,
    resultSummary: Schema.Types.Mixed,
    cancelRequested: { type: Boolean, required: true },
    attemptId: String,
    providerDispatchState: String,
    providerRequestId: String,
  },
  { collection: "enterprise_jobs" }
);

enterpriseJobSchema.index({ status: 1, createdAt: 1 });

export const EnterpriseJob = model("EnterpriseJob", enterpriseJobSchema);
