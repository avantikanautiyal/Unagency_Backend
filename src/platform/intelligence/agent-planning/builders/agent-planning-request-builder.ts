/**
 * Agent Planning request builder.
 */

import type { AgentPlanningRequest } from "../contracts/request";
import type { StructuredTaskPlan } from "../../task-intelligence/contracts/planning";

export class AgentPlanningRequestBuilder {
  private requestId = "";
  private structuredTaskPlan?: StructuredTaskPlan;
  private scenarioHint?: string;
  private preferredTeamPlaybook?: string;
  private maxAgents?: number;

  static create(): AgentPlanningRequestBuilder {
    return new AgentPlanningRequestBuilder();
  }

  withRequestId(id: string): this {
    this.requestId = id;
    return this;
  }

  withStructuredTaskPlan(plan: StructuredTaskPlan): this {
    this.structuredTaskPlan = plan;
    return this;
  }

  withScenarioHint(hint: string): this {
    this.scenarioHint = hint;
    return this;
  }

  withPreferredTeamPlaybook(playbook: string): this {
    this.preferredTeamPlaybook = playbook;
    return this;
  }

  withMaxAgents(max: number): this {
    this.maxAgents = max;
    return this;
  }

  build(): AgentPlanningRequest {
    if (!this.requestId.trim()) throw new Error("requestId required");
    if (!this.structuredTaskPlan) throw new Error("structuredTaskPlan required");
    return Object.freeze({
      requestId: this.requestId,
      structuredTaskPlan: this.structuredTaskPlan,
      scenarioHint: this.scenarioHint,
      preferredTeamPlaybook: this.preferredTeamPlaybook,
      maxAgents: this.maxAgents,
    });
  }
}
