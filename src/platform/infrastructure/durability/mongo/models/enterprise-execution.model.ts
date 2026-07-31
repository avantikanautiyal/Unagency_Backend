import { Schema, model, type Document } from "mongoose";
import type { ExecutionApiStatus } from "../../../../api/contracts/enums";

export interface EnterpriseExecutionDoc extends Document {
  executionId: string;
  organizationId: string;
  workspaceId?: string;
  userId?: string;
  status: ExecutionApiStatus;
  correlationId: string;
  jobId?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  promptPreview: string;
  cost?: number;
  evaluationScore?: number;
  errorMessage?: string;
  executionMode?: string;
  attemptId?: string;
  providerDispatchState?: string;
  providerRequestId?: string;
}

const enterpriseExecutionSchema = new Schema<EnterpriseExecutionDoc>(
  {
    executionId: { type: String, required: true, unique: true, index: true },
    organizationId: { type: String, required: true, index: true },
    workspaceId: String,
    userId: String,
    status: { type: String, required: true, index: true },
    correlationId: { type: String, required: true },
    jobId: String,
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
    completedAt: String,
    promptPreview: { type: String, required: true },
    cost: Number,
    evaluationScore: Number,
    errorMessage: String,
    executionMode: String,
    attemptId: String,
    providerDispatchState: String,
    providerRequestId: String,
  },
  { collection: "enterprise_executions" }
);

enterpriseExecutionSchema.index({ organizationId: 1, createdAt: -1 });
enterpriseExecutionSchema.index({ organizationId: 1, status: 1 });

export const EnterpriseExecution = model<EnterpriseExecutionDoc>(
  "EnterpriseExecution",
  enterpriseExecutionSchema
);
