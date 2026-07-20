/**
 * Workflow execution planner.
 */

import { success, type Result } from "../../shared/result";
import { asWorkflowPlanId } from "../contracts/identifiers";
import type { WorkflowIntelligenceRequest } from "../contracts/request";
import type { WorkflowExecutionPlan } from "../contracts/plan";
import type { ExecutionWorkflowGraph } from "../contracts/graph";
import type { WorkflowStage } from "../contracts/stages";
import type { ApprovalPlan } from "../contracts/approvals";
import type { CheckpointPlan } from "../contracts/checkpoints";
import type { RollbackPlan, RecoveryPlan, ResumePlan } from "../contracts/recovery";
import type { WorkflowManifest } from "../contracts/versioning";
import type { IWorkflowExecutionPlanner } from "../interfaces/workflow-intelligence";
import { WORKFLOW_INTELLIGENCE_VERSION } from "../constants";

export class DefaultWorkflowExecutionPlanner implements IWorkflowExecutionPlanner {
  constructor(
    private readonly createId: (prefix: string) => string = (p) => `${p}_1`,
    private readonly nowIso: () => string = () => new Date().toISOString()
  ) {}

  assemble(
    request: WorkflowIntelligenceRequest,
    graph: ExecutionWorkflowGraph,
    stages: readonly WorkflowStage[],
    approval: ApprovalPlan,
    checkpoints: CheckpointPlan,
    rollback: RollbackPlan,
    recovery: RecoveryPlan,
    resume: ResumePlan
  ): Result<WorkflowExecutionPlan> {
    const manifest: WorkflowManifest = {
      manifestId: this.createId("manifest"),
      name: `${request.executionTeamPlan.teamName} Workflow`,
      version: {
        version: WORKFLOW_INTELLIGENCE_VERSION,
        kind: "major",
        revision: 1,
        createdAt: this.nowIso(),
      },
      lifecycle: "validated",
      nodeCount: graph.nodes.length,
      stageCount: stages.length,
      snapshot: false,
    };

    return success({
      planId: asWorkflowPlanId(this.createId("wep")),
      name: manifest.name,
      graph,
      stages,
      approvalPlan: approval,
      checkpointPlan: checkpoints,
      rollbackPlan: rollback,
      recoveryPlan: recovery,
      resumePlan: resume,
      manifest,
      version: WORKFLOW_INTELLIGENCE_VERSION,
      createdAt: this.nowIso(),
    });
  }
}
