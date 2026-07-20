/**
 * Governance execution plan — primary output.
 */

import type { GovernancePlanId } from "./identifiers";
import type { WorkflowExecutionPlan } from "../../workflow-intelligence/contracts/plan";
import type { GovernanceDecision, ExecutionAuthorization, EscalationPlan } from "./decision";
import type { PolicyEvaluationReport } from "./policies";
import type { RiskAssessment } from "./risk";
import type { BudgetAssessment } from "./budget";
import type { ComplianceAssessment, SecurityAssessment, PrivacyAssessment } from "./compliance";
import type { GovernanceApprovalPlan, QualityGateReport } from "./approvals";

export interface GovernanceExecutionPlan {
  readonly planId: GovernancePlanId;
  readonly workflowPlanId: string;
  readonly workflowExecutionPlan: WorkflowExecutionPlan;
  readonly decision: GovernanceDecision;
  readonly authorization: ExecutionAuthorization;
  readonly policyEvaluation: PolicyEvaluationReport;
  readonly riskAssessment: RiskAssessment;
  readonly budgetAssessment: BudgetAssessment;
  readonly complianceAssessment: ComplianceAssessment;
  readonly securityAssessment: SecurityAssessment;
  readonly privacyAssessment: PrivacyAssessment;
  readonly approvalPlan: GovernanceApprovalPlan;
  readonly qualityGates: QualityGateReport;
  readonly escalationPlan: EscalationPlan;
  readonly version: string;
  readonly createdAt: string;
}
