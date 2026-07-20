/**
 * Workflow Intelligence request builder.
 */

import type { WorkflowIntelligenceRequest } from "../contracts/request";
import type { ExecutionTeamPlan } from "../../agent-planning/contracts/team-plan";

export class WorkflowIntelligenceRequestBuilder {
  private requestId = "";
  private executionTeamPlan?: ExecutionTeamPlan;
  private scenarioHint?: string;
  private maxConcurrency?: number;

  static create(): WorkflowIntelligenceRequestBuilder {
    return new WorkflowIntelligenceRequestBuilder();
  }

  withRequestId(id: string): this {
    this.requestId = id;
    return this;
  }

  withExecutionTeamPlan(plan: ExecutionTeamPlan): this {
    this.executionTeamPlan = plan;
    return this;
  }

  withScenarioHint(hint: string): this {
    this.scenarioHint = hint;
    return this;
  }

  withMaxConcurrency(max: number): this {
    this.maxConcurrency = max;
    return this;
  }

  build(): WorkflowIntelligenceRequest {
    if (!this.requestId.trim()) throw new Error("requestId required");
    if (!this.executionTeamPlan) throw new Error("executionTeamPlan required");
    return Object.freeze({
      requestId: this.requestId,
      executionTeamPlan: this.executionTeamPlan,
      scenarioHint: this.scenarioHint,
      maxConcurrency: this.maxConcurrency,
    });
  }
}
