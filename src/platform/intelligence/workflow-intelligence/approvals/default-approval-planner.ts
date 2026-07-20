/**
 * Approval and checkpoint planners.
 */

import { success, type Result } from "../../shared/result";
import { asCheckpointId } from "../contracts/identifiers";
import type { ExecutionWorkflowGraph } from "../contracts/graph";
import type { ExecutionTeamPlan } from "../../agent-planning/contracts/team-plan";
import type { ApprovalPlan, ApprovalGate } from "../contracts/approvals";
import type { CheckpointPlan, ExecutionCheckpoint } from "../contracts/checkpoints";
import type { IApprovalPlanner, ICheckpointPlanner } from "../interfaces/workflow-intelligence";

export class DefaultApprovalPlanner implements IApprovalPlanner {
  constructor(private readonly createId: (prefix: string) => string = (p) => `${p}_1`) {}

  plan(graph: ExecutionWorkflowGraph, teamPlan: ExecutionTeamPlan): Result<ApprovalPlan> {
    const gates: ApprovalGate[] = [];

    for (const node of graph.nodes) {
      if (node.kind !== "approval_gate" && !node.name.toLowerCase().includes("review")) continue;

      const kind = node.name.includes("Human")
        ? "human"
        : node.name.includes("Brand")
          ? "brand"
          : node.name.includes("Legal")
            ? "legal"
            : node.name.includes("Creative") || node.name.includes("QA")
              ? "creative"
              : "human";

      gates.push({
        gateId: this.createId("gate"),
        kind: kind as never,
        name: node.name,
        nodeId: node.nodeId,
        inputs: node.consumes,
        outputs: node.produces,
        requiredArtifacts: [`${node.name} input package`],
        blocking: true,
        rationale: `${node.name} gate required before downstream execution`,
      });
    }

    return success({
      planId: this.createId("approval"),
      gates,
      finalHumanApproval: gates.some((g) => g.kind === "human"),
      rationale: `${gates.length} approval gates derived from team review hierarchy`,
    });
  }
}

export class DefaultCheckpointPlanner implements ICheckpointPlanner {
  constructor(private readonly createId: (prefix: string) => string = (p) => `${p}_1`) {}

  plan(graph: ExecutionWorkflowGraph, _teamPlan: ExecutionTeamPlan): Result<CheckpointPlan> {
    const checkpoints: ExecutionCheckpoint[] = graph.nodes
      .filter((n) => n.blocking || n.kind === "checkpoint" || n.stage === "planning")
      .map((n) => ({
        checkpointId: asCheckpointId(this.createId(`chk_${n.nodeId}`)),
        kind: n.kind === "checkpoint" ? "review_point" : n.stage === "planning" ? "save_point" : "quality_point",
        name: `${n.name} Checkpoint`,
        nodeId: n.nodeId,
        saveState: true,
        recoverable: true,
        rationale: `Checkpoint at ${n.name} for recovery and audit`,
      }));

    // Add audit checkpoint at end
    const lastNode = graph.nodes[graph.nodes.length - 1];
    if (lastNode) {
      checkpoints.push({
        checkpointId: asCheckpointId(this.createId("chk_audit")),
        kind: "audit_point",
        name: "Workflow Audit Checkpoint",
        nodeId: lastNode.nodeId,
        saveState: true,
        recoverable: false,
        rationale: "Final audit point before completion",
      });
    }

    return success({
      planId: this.createId("checkpoint"),
      checkpoints,
      rationale: `${checkpoints.length} checkpoints for save, review, quality, and audit`,
    });
  }
}
