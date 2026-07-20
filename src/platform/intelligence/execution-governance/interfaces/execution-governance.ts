/**
 * Execution Governance public interfaces.
 */

import type { Result } from "../../shared/result";
import type { GovernanceRequest } from "../contracts/request";
import type { GovernanceReport, GovernanceExplanation } from "../contracts/result";
import type { WorkflowExecutionPlan } from "../../workflow-intelligence/contracts/plan";
import type { PolicyRule, PolicyEvaluationReport } from "../contracts/policies";
import type { RiskAssessment } from "../contracts/risk";
import type { BudgetAssessment } from "../contracts/budget";
import type { ComplianceAssessment, SecurityAssessment, PrivacyAssessment } from "../contracts/compliance";
import type { GovernanceApprovalPlan, QualityGateReport } from "../contracts/approvals";
import type { GovernanceDecision, EscalationPlan, ExecutionAuthorization } from "../contracts/decision";
import type { GovernanceExecutionPlan } from "../contracts/plan";

export interface IExecutionGovernanceEngine {
  evaluate(request: GovernanceRequest): Promise<Result<GovernanceReport>>;
  explain(request: GovernanceRequest): Promise<Result<GovernanceExplanation>>;
}

export interface IPolicyRepository {
  list(): Result<readonly PolicyRule[]>;
  get(policyId: string): Result<PolicyRule>;
}

export interface IPolicyEvaluator {
  evaluate(request: GovernanceRequest, policies: readonly PolicyRule[]): Result<PolicyEvaluationReport>;
}

export interface IRiskEngine {
  assess(request: GovernanceRequest): Result<RiskAssessment>;
}

export interface IBudgetEngine {
  assess(request: GovernanceRequest): Result<BudgetAssessment>;
}

export interface IComplianceEvaluator {
  evaluate(request: GovernanceRequest): Result<ComplianceAssessment>;
}

export interface ISecurityEvaluator {
  evaluate(request: GovernanceRequest): Result<SecurityAssessment>;
}

export interface IPrivacyEvaluator {
  evaluate(request: GovernanceRequest): Result<PrivacyAssessment>;
}

export interface IApprovalEngine {
  resolve(
    request: GovernanceRequest,
    policyReport: PolicyEvaluationReport,
    riskAssessment: RiskAssessment
  ): Result<GovernanceApprovalPlan>;
}

export interface IQualityGateValidator {
  validate(request: GovernanceRequest): Result<QualityGateReport>;
}

export interface IEscalationPlanner {
  plan(
    request: GovernanceRequest,
    decision: GovernanceDecision,
    riskAssessment: RiskAssessment
  ): Result<EscalationPlan>;
}

export interface IGovernanceDecisionEngine {
  decide(
    request: GovernanceRequest,
    policyReport: PolicyEvaluationReport,
    riskAssessment: RiskAssessment,
    budgetAssessment: BudgetAssessment,
    approvalPlan: GovernanceApprovalPlan,
    qualityGates: QualityGateReport
  ): Result<GovernanceDecision>;
}

export interface IAuthorizationEngine {
  authorize(decision: GovernanceDecision): Result<ExecutionAuthorization>;
}

export interface IGovernancePlanBuilder {
  build(
    request: GovernanceRequest,
    decision: GovernanceDecision,
    authorization: ExecutionAuthorization,
    policyReport: PolicyEvaluationReport,
    riskAssessment: RiskAssessment,
    budgetAssessment: BudgetAssessment,
    complianceAssessment: ComplianceAssessment,
    securityAssessment: SecurityAssessment,
    privacyAssessment: PrivacyAssessment,
    approvalPlan: GovernanceApprovalPlan,
    qualityGates: QualityGateReport,
    escalationPlan: EscalationPlan
  ): Result<GovernanceExecutionPlan>;
}
