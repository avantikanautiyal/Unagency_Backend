/**
 * Stage builder and dependency/parallel planners.
 */

import { success, type Result } from "../../shared/result";
import type { ExecutionTeamPlan } from "../../agent-planning/contracts/team-plan";
import type { ExecutionWorkflowGraph } from "../contracts/graph";
import type { WorkflowStage } from "../contracts/stages";
import type { WorkflowStageKind } from "../contracts/enums";
import type {
  IStageBuilder,
  IDependencyPlanner,
  IParallelizationPlanner,
  IConditionalBranchPlanner,
} from "../interfaces/workflow-intelligence";
import { STAGE_ORDER } from "../workflow/stage-mapping";

export class DefaultStageBuilder implements IStageBuilder {
  constructor(private readonly createId: (prefix: string) => string = (p) => `${p}_1`) {}

  build(_teamPlan: ExecutionTeamPlan, graph: ExecutionWorkflowGraph): Result<readonly WorkflowStage[]> {
    const stageMap = new Map<WorkflowStageKind, typeof graph.nodes>();

    for (const node of graph.nodes) {
      const list = stageMap.get(node.stage) ?? [];
      list.push(node);
      stageMap.set(node.stage, list);
    }

    const stages: WorkflowStage[] = [...stageMap.entries()]
      .sort(([a], [b]) => STAGE_ORDER[a] - STAGE_ORDER[b])
      .map(([kind, nodes]) => ({
        stageId: this.createId(`stage_${kind}`),
        kind,
        name: kind.charAt(0).toUpperCase() + kind.slice(1),
        order: STAGE_ORDER[kind],
        nodeIds: nodes.map((n) => n.nodeId),
        parallel: nodes.length > 1 && nodes.every((n) => n.stage === kind),
        estimatedDurationMinutes: nodes.length * 30,
        rationale: `${nodes.length} nodes in ${kind} stage`,
      }));

    return success(stages);
  }
}

export class DefaultDependencyPlanner implements IDependencyPlanner {
  plan(graph: ExecutionWorkflowGraph, _teamPlan: ExecutionTeamPlan): Result<ExecutionWorkflowGraph> {
    return success(graph);
  }
}

export class DefaultParallelizationPlanner implements IParallelizationPlanner {
  plan(graph: ExecutionWorkflowGraph, teamPlan: ExecutionTeamPlan): Result<ExecutionWorkflowGraph> {
    return success(graph);
  }
}

export class DefaultConditionalBranchPlanner implements IConditionalBranchPlanner {
  plan(graph: ExecutionWorkflowGraph): Result<ExecutionWorkflowGraph> {
    const qualityBranch = graph.nodes.find((n) => n.stage === "review");
    if (!qualityBranch) return success(graph);

    return success({
      ...graph,
      conditionalGroups: [
        {
          groupId: "cg_quality",
          condition: "quality_score < threshold",
          branchKind: "quality_decision",
          trueBranch: [qualityBranch.nodeId],
          falseBranch: graph.nodes.filter((n) => n.stage === "approval").map((n) => n.nodeId),
        },
      ],
    });
  }
}
