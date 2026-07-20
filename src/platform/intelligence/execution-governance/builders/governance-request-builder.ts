/**
 * Governance request builder.
 */

import type { GovernanceRequest } from "../contracts/request";
import type { WorkflowExecutionPlan } from "../../workflow-intelligence/contracts/plan";

export class GovernanceRequestBuilder {
  private requestId = "";
  private workflowExecutionPlan?: WorkflowExecutionPlan;
  private organizationId?: string;
  private workspaceId?: string;
  private budgetLimit?: number;
  private tokenBudgetLimit?: number;
  private regionHint?: string;
  private complianceFrameworks?: string[];

  static create(): GovernanceRequestBuilder {
    return new GovernanceRequestBuilder();
  }

  withRequestId(id: string): this {
    this.requestId = id;
    return this;
  }

  withWorkflowExecutionPlan(plan: WorkflowExecutionPlan): this {
    this.workflowExecutionPlan = plan;
    return this;
  }

  withBudgetLimit(limit: number): this {
    this.budgetLimit = limit;
    return this;
  }

  withTokenBudgetLimit(limit: number): this {
    this.tokenBudgetLimit = limit;
    return this;
  }

  withRegionHint(region: string): this {
    this.regionHint = region;
    return this;
  }

  withComplianceFrameworks(frameworks: string[]): this {
    this.complianceFrameworks = frameworks;
    return this;
  }

  build(): GovernanceRequest {
    if (!this.requestId.trim()) throw new Error("requestId required");
    if (!this.workflowExecutionPlan) throw new Error("workflowExecutionPlan required");
    return Object.freeze({
      requestId: this.requestId,
      workflowExecutionPlan: this.workflowExecutionPlan,
      organizationId: this.organizationId,
      workspaceId: this.workspaceId,
      budgetLimit: this.budgetLimit,
      tokenBudgetLimit: this.tokenBudgetLimit,
      regionHint: this.regionHint,
      complianceFrameworks: this.complianceFrameworks,
    });
  }
}
