/**
 * Workflow Intelligence result contracts.
 */

import type { WorkflowIntelligenceResultId } from "./identifiers";
import type { WorkflowIntelligenceRequest } from "./request";
import type { WorkflowExecutionPlan } from "./plan";
import type { ExecutionWorkflowGraph } from "./graph";
import type { WorkflowStage } from "./stages";
import type { ApprovalPlan } from "./approvals";
import type { CheckpointPlan } from "./checkpoints";
import type { RollbackPlan, RecoveryPlan, ResumePlan } from "./recovery";
import type {
  SimulationReport,
  WorkflowOptimizationReport,
  WorkflowValidationReport,
} from "./simulation";
import type { WorkflowExplanation } from "./explainability";

export interface WorkflowIntelligenceStatistics {
  readonly nodes: number;
  readonly edges: number;
  readonly stages: number;
  readonly parallelGroups: number;
  readonly approvalGates: number;
  readonly checkpoints: number;
  readonly durationMs: number;
}

export interface WorkflowIntelligenceReport {
  readonly resultId: WorkflowIntelligenceResultId;
  readonly request: WorkflowIntelligenceRequest;
  readonly workflowExecutionPlan: WorkflowExecutionPlan;
  readonly graph: ExecutionWorkflowGraph;
  readonly stages: readonly WorkflowStage[];
  readonly checkpoints: CheckpointPlan;
  readonly simulation: SimulationReport;
  readonly optimization: WorkflowOptimizationReport;
  readonly validation: WorkflowValidationReport;
  readonly explanation: WorkflowExplanation;
  readonly statistics: WorkflowIntelligenceStatistics;
  readonly createdAt: string;
}
