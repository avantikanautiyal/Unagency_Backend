import { Schema, model, type Document } from "mongoose";
import type {
  ExecutionCostSummary,
  ExecutionDiagnostics,
  ExecutionEvaluationSummary,
  ExecutionExperienceSummary,
  ExecutionTraceSummary,
} from "../../../../api/contracts";

export interface EnterpriseExecutionExtrasDoc extends Document {
  executionId: string;
  organizationId: string;
  diagnostics: ExecutionDiagnostics;
  trace: ExecutionTraceSummary;
  cost: ExecutionCostSummary;
  evaluation: ExecutionEvaluationSummary;
  experience: ExecutionExperienceSummary;
  updatedAt: string;
}

const enterpriseExecutionExtrasSchema = new Schema<EnterpriseExecutionExtrasDoc>(
  {
    executionId: { type: String, required: true, unique: true, index: true },
    organizationId: { type: String, required: true, index: true },
    diagnostics: { type: Schema.Types.Mixed, required: true },
    trace: { type: Schema.Types.Mixed, required: true },
    cost: { type: Schema.Types.Mixed, required: true },
    evaluation: { type: Schema.Types.Mixed, required: true },
    experience: { type: Schema.Types.Mixed, required: true },
    updatedAt: { type: String, required: true },
  },
  { collection: "enterprise_execution_extras" }
);

export const EnterpriseExecutionExtras = model<EnterpriseExecutionExtrasDoc>(
  "EnterpriseExecutionExtras",
  enterpriseExecutionExtrasSchema
);
