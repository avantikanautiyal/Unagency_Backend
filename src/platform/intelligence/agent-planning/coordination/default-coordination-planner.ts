/**
 * Coordination, communication, review, merge planners.
 */

import { success, type Result } from "../../shared/result";
import { asAgentId } from "../contracts/identifiers";
import type { AgentGraph } from "../contracts/graph";
import type { StructuredTaskPlan } from "../../task-intelligence/contracts/planning";
import type { RoleAssignmentMap } from "../contracts/assignment";
import type { CoordinationPlan, CommunicationPlan, CommunicationRule } from "../contracts/coordination";
import type { MergePlan, MergeStep } from "../contracts/merge";
import type { ReviewHierarchy, ReviewLevel } from "../contracts/review";
import type { TeamPlaybook } from "../contracts/playbook";
import type {
  ICoordinationPlanner,
  ICommunicationPlanner,
  IReviewHierarchyPlanner,
  IMergeStrategyPlanner,
} from "../interfaces/agent-planning";

export class DefaultCoordinationPlanner implements ICoordinationPlanner {
  constructor(private readonly createId: (prefix: string) => string = (p) => `${p}_1`) {}

  plan(agentGraph: AgentGraph, playbook?: TeamPlaybook): Result<CoordinationPlan> {
    const supervisor = agentGraph.nodes.find((n) => n.isSupervisor);
    const hasParallel = agentGraph.nodes.some((n) => !!n.parallelGroup);

    return success({
      planId: this.createId("coord"),
      primaryStrategy: hasParallel ? "pipeline" : "sequential",
      secondaryStrategies: hasParallel ? ["parallel", "supervisor"] : ["hierarchical"],
      supervisorAgentId: supervisor?.agentId,
      coordinatorAgentId: agentGraph.nodes.find((n) => n.role === "Campaign Strategist")?.agentId,
      rationale: playbook
        ? `Coordination via ${playbook.coordinationStrategy} team playbook`
        : "Pipeline coordination with supervisor oversight for parallel creative work",
    });
  }
}

export class DefaultCommunicationPlanner implements ICommunicationPlanner {
  constructor(private readonly createId: (prefix: string) => string = (p) => `${p}_1`) {}

  plan(agentGraph: AgentGraph): Result<CommunicationPlan> {
    const matrix: CommunicationRule[] = [];
    const roles = agentGraph.nodes.map((n) => n.role);

    for (const edge of agentGraph.edges) {
      const from = agentGraph.nodes.find((n) => n.agentId === edge.from);
      const to = agentGraph.nodes.find((n) => n.agentId === edge.to);
      if (!from || !to) continue;
      matrix.push({
        fromRole: from.role,
        toRole: to.role,
        artifactKinds: [edge.artifactType as never],
        bidirectional: false,
      });
    }

    return success({
      planId: this.createId("comm"),
      matrix,
      artifactOnly: true,
      rationale: "Agents exchange artifacts only — never raw prompts",
    });
  }
}

export class DefaultReviewHierarchyPlanner implements IReviewHierarchyPlanner {
  constructor(private readonly createId: (prefix: string) => string = (p) => `${p}_1`) {}

  plan(agentGraph: AgentGraph, _taskPlan: StructuredTaskPlan): Result<ReviewHierarchy> {
    const levels: ReviewLevel[] = [];
    let level = 1;

    const creativeDirector = agentGraph.nodes.find((n) => n.role === "Creative Director");
    if (creativeDirector) {
      levels.push({
        level: level++,
        role: creativeDirector.role,
        agentId: creativeDirector.agentId,
        authority: "lead",
        reviewsRoles: ["Copywriter", "Content Planner"],
        isHumanGate: false,
      });
    }

    const qa = agentGraph.nodes.find((n) => n.isReviewer);
    if (qa) {
      levels.push({
        level: level++,
        role: qa.role,
        agentId: qa.agentId,
        authority: "director",
        reviewsRoles: agentGraph.nodes.filter((n) => !n.isReviewer && !n.isHumanGate).map((n) => n.role),
        isHumanGate: false,
      });
    }

    const human = agentGraph.nodes.find((n) => n.isHumanGate);
    if (human) {
      levels.push({
        level: level++,
        role: human.role,
        agentId: human.agentId,
        authority: "human",
        reviewsRoles: ["QA Reviewer"],
        isHumanGate: true,
      });
    }

    return success({
      hierarchyId: this.createId("review"),
      levels,
      finalHumanApproval: !!human,
      rationale: "Creative Director → QA Reviewer → Human Approval review chain",
    });
  }
}

export class DefaultMergeStrategyPlanner implements IMergeStrategyPlanner {
  constructor(private readonly createId: (prefix: string) => string = (p) => `${p}_1`) {}

  plan(agentGraph: AgentGraph, _taskPlan: StructuredTaskPlan): Result<MergePlan> {
    const parallelAgents = agentGraph.nodes.filter((n) => n.parallelGroup);
    const steps: MergeStep[] = [];

    if (parallelAgents.length > 0) {
      steps.push({
        stepId: this.createId("merge"),
        strategy: "reviewer_merge",
        contributorAgentIds: parallelAgents.map((a) => a.agentId),
        outputArtifactKind: "execution_artifact",
        rationale: "Parallel creative outputs merged by Creative Director review",
      });
    }

    steps.push({
      stepId: this.createId("merge_final"),
      strategy: "human_merge",
      contributorAgentIds: agentGraph.nodes.filter((n) => n.isReviewer).map((n) => n.agentId),
      outputArtifactKind: "decision_artifact",
      rationale: "Final campaign package requires human approval merge",
    });

    return success({
      planId: this.createId("merge_plan"),
      primaryStrategy: parallelAgents.length > 0 ? "reviewer_merge" : "sequential_merge",
      steps,
      humanMergeRequired: true,
      rationale: "Reviewer merge for parallel creatives, human merge for final approval",
    });
  }
}
