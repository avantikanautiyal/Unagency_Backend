/**
 * Rollback, recovery, and resume planners.
 */

import { success, type Result } from "../../shared/result";
import type { ExecutionWorkflowGraph } from "../contracts/graph";
import type { ExecutionTeamPlan } from "../../agent-planning/contracts/team-plan";
import type { CheckpointPlan } from "../contracts/checkpoints";
import type { RollbackPlan, RecoveryPlan, ResumePlan } from "../contracts/recovery";
import type {
  IFailureRecoveryPlanner,
  IRollbackPlanner,
  IResumePlanner,
} from "../interfaces/workflow-intelligence";

export class DefaultRollbackPlanner implements IRollbackPlanner {
  constructor(private readonly createId: (prefix: string) => string = (p) => `${p}_1`) {}

  plan(graph: ExecutionWorkflowGraph, _teamPlan: ExecutionTeamPlan): Result<RollbackPlan> {
    const reviewNodes = graph.nodes.filter((n) => n.stage === "review" || n.stage === "generation");
    const planningNodes = graph.nodes.filter((n) => n.stage === "planning");

    const steps = reviewNodes.slice(0, 3).map((n, i) => ({
      stepId: this.createId(`rb_${i}`),
      fromNodeId: n.nodeId,
      toNodeId: planningNodes[0]?.nodeId ?? graph.rootNodes[0],
      scope: "stage",
      order: i + 1,
      condition: "quality_check_failed",
    }));

    return success({
      planId: this.createId("rollback"),
      steps,
      rollbackGraph: steps.map((s) => s.toNodeId),
      conditions: ["quality_check_failed", "approval_rejected", "compliance_failure"],
      scope: "stage",
      rationale: "Rollback to planning stage on quality or approval failure",
    });
  }
}

export class DefaultFailureRecoveryPlanner implements IFailureRecoveryPlanner {
  constructor(private readonly createId: (prefix: string) => string = (p) => `${p}_1`) {}

  plan(graph: ExecutionWorkflowGraph, teamPlan: ExecutionTeamPlan): Result<RecoveryPlan> {
    const actions = graph.nodes
      .filter((n) => n.kind === "execution")
      .slice(0, 5)
      .map((n, i) => ({
        actionId: this.createId(`rec_${i}`),
        kind: "retry" as const,
        targetNodeId: n.nodeId,
        maxRetries: 2,
        escalateTo: teamPlan.reviewHierarchy.levels[0]?.role,
        rationale: `Retry ${n.name} up to 2 times before escalation`,
      }));

    actions.push({
      actionId: this.createId("rec_escalate"),
      kind: "escalation",
      targetNodeId: graph.leafNodes[0] ?? graph.nodes[0].nodeId,
      maxRetries: 0,
      escalateTo: "Human Approval",
      rationale: "Escalate to human after retry exhaustion",
    });

    return success({
      planId: this.createId("recovery"),
      actions,
      defaultAction: "retry",
      rationale: "Retry with escalation path to human intervention",
    });
  }
}

export class DefaultResumePlanner implements IResumePlanner {
  constructor(private readonly createId: (prefix: string) => string = (p) => `${p}_1`) {}

  plan(graph: ExecutionWorkflowGraph, checkpoints: CheckpointPlan): Result<ResumePlan> {
    const resumeCheckpoints = checkpoints.checkpoints
      .filter((c) => c.recoverable)
      .map((c) => ({
        checkpointId: String(c.checkpointId),
        nodeId: c.nodeId,
        artifactRecovery: ["execution_artifact", "review_artifact"],
      }));

    return success({
      planId: this.createId("resume"),
      checkpoints: resumeCheckpoints,
      restartNodeId: graph.rootNodes[0],
      continuationStrategy: "resume_from_last_checkpoint",
      rationale: "Resume from last recoverable checkpoint with artifact recovery",
    });
  }
}
