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
  osLifecycle?: string;
  governance?: unknown;
  asyncLane?: unknown;
  /** Phase 1 — StructuredBrief (tenant-scoped via organizationId). */
  structuredBrief?: unknown;
  /** Phase 2 — BrandContext (tenant-scoped via organizationId). */
  structuredBrandContext?: unknown;
  /** Phase 3 — KnowledgeContext (tenant-scoped via organizationId). */
  structuredKnowledgeContext?: unknown;
  /** Phase 4 — ExecutionPlan (tenant-scoped via organizationId). */
  structuredExecutionPlan?: unknown;
  /** Phase 5 — TaskGraphRunSnapshot (tenant-scoped via organizationId). */
  structuredTaskGraphState?: unknown;
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
    osLifecycle: { type: String, required: false },
    governance: { type: Schema.Types.Mixed, required: false },
    asyncLane: { type: Schema.Types.Mixed, required: false },
    structuredBrief: { type: Schema.Types.Mixed, required: false },
    structuredBrandContext: { type: Schema.Types.Mixed, required: false },
    structuredKnowledgeContext: { type: Schema.Types.Mixed, required: false },
    structuredExecutionPlan: { type: Schema.Types.Mixed, required: false },
    structuredTaskGraphState: { type: Schema.Types.Mixed, required: false },
    updatedAt: { type: String, required: true },
  },
  { collection: "enterprise_execution_extras" }
);

export const EnterpriseExecutionExtras = model<EnterpriseExecutionExtrasDoc>(
  "EnterpriseExecutionExtras",
  enterpriseExecutionExtrasSchema
);
