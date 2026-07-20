/**
 * Governance request contract.
 */

import type { WorkflowExecutionPlan } from "../../workflow-intelligence/contracts/plan";

export interface GovernanceRequest {
  readonly requestId: string;
  readonly workflowExecutionPlan: WorkflowExecutionPlan;
  readonly organizationId?: string;
  readonly workspaceId?: string;
  readonly budgetLimit?: number;
  readonly tokenBudgetLimit?: number;
  readonly regionHint?: string;
  readonly complianceFrameworks?: readonly string[];
}
