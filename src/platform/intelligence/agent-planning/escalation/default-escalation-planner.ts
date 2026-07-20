/**
 * Escalation planner.
 */

import { success, type Result } from "../../shared/result";
import type { AgentGraph } from "../contracts/graph";
import type { ReviewHierarchy } from "../contracts/review";
import type { EscalationPlan } from "../contracts/delegation";
import type { IEscalationPlanner } from "../interfaces/agent-planning";

export class DefaultEscalationPlanner implements IEscalationPlanner {
  constructor(private readonly createId: (prefix: string) => string = (p) => `${p}_1`) {}

  plan(agentGraph: AgentGraph, reviewHierarchy: ReviewHierarchy): Result<EscalationPlan> {
    const retryOwnership: Record<string, string> = {};
    for (const node of agentGraph.nodes) {
      if (!node.isReviewer && !node.isHumanGate) {
        retryOwnership[String(node.agentId)] = node.role;
      }
    }

    const paths = agentGraph.nodes
      .filter((n) => !n.isHumanGate)
      .map((n) => ({
        pathId: this.createId("esc"),
        fromAgentId: n.agentId,
        levels: ["agent_retry", "supervisor", "human"] as const,
        ownerRole: n.isReviewer ? "Human Approval" : "Creative Director",
        rationale: `Escalation from ${n.role} through supervisor to human`,
      }));

    return success({
      planId: this.createId("escalation"),
      paths,
      retryOwnership,
      rationale: `${reviewHierarchy.levels.length}-level review hierarchy defines escalation paths`,
    });
  }
}
