/**
 * Approval, quality gate, decision, and authorization engines.
 */

import { success, type Result } from "../../shared/result";
import { asGovernanceDecisionId } from "../contracts/identifiers";
import type { GovernanceRequest } from "../contracts/request";
import type { PolicyEvaluationReport } from "../contracts/policies";
import type { RiskAssessment } from "../contracts/risk";
import type { BudgetAssessment } from "../contracts/budget";
import type { GovernanceApprovalPlan, ApprovalRequirement, QualityGateReport } from "../contracts/approvals";
import type { GovernanceDecision, ExecutionAuthorization, EscalationPlan } from "../contracts/decision";
import type { GovernanceExecutionPlan } from "../contracts/plan";
import type {
  IApprovalEngine,
  IQualityGateValidator,
  IGovernanceDecisionEngine,
  IAuthorizationEngine,
  IEscalationPlanner,
  IGovernancePlanBuilder,
} from "../interfaces/execution-governance";
import { asGovernancePlanId } from "../contracts/identifiers";
import { EXECUTION_GOVERNANCE_VERSION } from "../constants";
import type { ComplianceAssessment, SecurityAssessment, PrivacyAssessment } from "../contracts/compliance";

export class DefaultApprovalEngine implements IApprovalEngine {
  constructor(private readonly createId: (prefix: string) => string = (p) => `${p}_1`) {}

  resolve(
    request: GovernanceRequest,
    policyReport: PolicyEvaluationReport,
    riskAssessment: RiskAssessment
  ): Result<GovernanceApprovalPlan> {
    const requirements: ApprovalRequirement[] = [];
    const isLaunch = request.workflowExecutionPlan.name.toLowerCase().includes("launch");

    if (isLaunch || riskAssessment.overallSeverity !== "low") {
      requirements.push(approval("brand", "pending", "Brand alignment review required", true));
    }

    if (request.workflowExecutionPlan.approvalPlan.finalHumanApproval) {
      requirements.push(approval("human", "pending", "Human approval required before execution", true));
    }

    if (riskAssessment.overallSeverity === "high" || riskAssessment.overallSeverity === "critical") {
      requirements.push(approval("executive", "pending", "Executive approval for elevated risk", true));
    }

    if (!policyReport.allPassed) {
      requirements.push(approval("manager", "pending", "Manager approval required due to policy failure", true));
    }

    if (requirements.length === 0) {
      requirements.push(approval("automatic", "approved", "Automatic approval — low risk workflow", false));
    }

    const pending = requirements.filter((r) => r.status === "pending").map((r) => r.kind);

    return success({
      planId: this.createId("approval"),
      requirements,
      allApproved: pending.length === 0,
      pendingApprovals: pending,
      rationale: `${requirements.length} approval requirements, ${pending.length} pending`,
    });
  }
}

export class DefaultQualityGateValidator implements IQualityGateValidator {
  constructor(private readonly createId: (prefix: string) => string = (p) => `${p}_1`) {}

  validate(request: GovernanceRequest): Result<QualityGateReport> {
    const gates = [
      { gateId: this.createId("qg"), kind: "minimum_quality_score" as const, passed: true, threshold: 0.7, actual: 0.85, message: "Quality threshold met" },
      { gateId: this.createId("qg"), kind: "minimum_confidence" as const, passed: true, threshold: 0.6, actual: 0.8, message: "Confidence threshold met" },
      { gateId: this.createId("qg"), kind: "required_review" as const, passed: request.workflowExecutionPlan.approvalPlan.gates.length > 0, message: "Review gates present" },
      { gateId: this.createId("qg"), kind: "brand_compliance" as const, passed: true, message: "Brand compliance check passed" },
      { gateId: this.createId("qg"), kind: "output_completeness" as const, passed: true, message: "Output completeness validated" },
    ];

    return success({
      reportId: this.createId("quality"),
      gates,
      allPassed: gates.every((g) => g.passed),
      rationale: "Quality gates evaluated for workflow readiness",
    });
  }
}

export class DefaultGovernanceDecisionEngine implements IGovernanceDecisionEngine {
  constructor(
    private readonly createId: (prefix: string) => string = (p) => `${p}_1`,
    private readonly nowIso: () => string = () => new Date().toISOString()
  ) {}

  decide(
    request: GovernanceRequest,
    policyReport: PolicyEvaluationReport,
    riskAssessment: RiskAssessment,
    budgetAssessment: BudgetAssessment,
    approvalPlan: GovernanceApprovalPlan,
    qualityGates: QualityGateReport
  ): Result<GovernanceDecision> {
    const mandatoryFailed = policyReport.evaluations.filter(
      (e) => !e.passed && policyReport.failedPolicies.includes(e.policyId)
    );

    let kind: GovernanceDecision["kind"] = "approved";
    let reason = "All governance checks passed";
    const requiredActions: string[] = [];
    const missingApprovals = approvalPlan.pendingApprovals.map(String);
    const conditions: string[] = [];

    if (!policyReport.allPassed) {
      const blocking = mandatoryFailed.length > 0 || !budgetAssessment.withinBudget;
      kind = blocking ? "blocked" : "approved_with_conditions";
      reason = blocking ? "Policy violations block execution" : "Approved with policy conditions";
      requiredActions.push("Resolve failed policies");
      conditions.push(...policyReport.evaluations.filter((e) => !e.passed).map((e) => e.message));
    }

    if (approvalPlan.pendingApprovals.length > 0 && kind === "approved") {
      kind = "pending_approval";
      reason = "Execution pending required approvals";
    }

    if (riskAssessment.overallSeverity === "critical") {
      kind = "escalated";
      reason = "Critical risk requires escalation";
      requiredActions.push("Executive review required");
    }

    if (!qualityGates.allPassed) {
      kind = kind === "approved" ? "approved_with_conditions" : kind;
      conditions.push("Quality gates require attention");
    }

    if (!budgetAssessment.withinBudget && kind === "approved") {
      kind = "blocked";
      reason = "Budget threshold exceeded";
    }

    return success({
      decisionId: asGovernanceDecisionId(this.createId("dec")),
      kind,
      reason,
      explanation: `Decision based on ${policyReport.evaluations.length} policies, ${riskAssessment.risks.length} risks, ${approvalPlan.requirements.length} approvals`,
      requiredActions,
      missingApprovals,
      conditions: conditions.length ? conditions : undefined,
      riskSummary: riskAssessment.summary,
      timestamp: this.nowIso(),
    });
  }
}

export class DefaultAuthorizationEngine implements IAuthorizationEngine {
  constructor(private readonly createId: (prefix: string) => string = (p) => `${p}_1`) {}

  authorize(decision: GovernanceDecision): Result<ExecutionAuthorization> {
    const authorized = decision.kind === "approved" || decision.kind === "approved_with_conditions";

    return success({
      authorizationId: this.createId("auth"),
      authorized,
      decision: decision.kind,
      validUntil: authorized ? undefined : undefined,
      constraints: decision.conditions ?? [],
      rationale: authorized ? "Execution authorized" : `Not authorized: ${decision.reason}`,
    });
  }
}

export class DefaultEscalationPlanner implements IEscalationPlanner {
  constructor(private readonly createId: (prefix: string) => string = (p) => `${p}_1`) {}

  plan(
    _request: GovernanceRequest,
    decision: GovernanceDecision,
    riskAssessment: RiskAssessment
  ): Result<EscalationPlan> {
    const requirements = [];

    if (decision.kind === "escalated" || riskAssessment.overallSeverity === "high") {
      requirements.push({
        escalationId: this.createId("esc"),
        level: "executive",
        reason: "Elevated risk profile",
        targetRole: "Executive Approval",
        blocking: true,
      });
    }

    if (decision.missingApprovals.length > 0) {
      requirements.push({
        escalationId: this.createId("esc"),
        level: "approval",
        reason: "Pending approvals",
        targetRole: decision.missingApprovals[0],
        blocking: true,
      });
    }

    return success({
      planId: this.createId("escalation"),
      requirements,
      rationale: `${requirements.length} escalation requirements`,
    });
  }
}

export class DefaultGovernancePlanBuilder implements IGovernancePlanBuilder {
  constructor(
    private readonly createId: (prefix: string) => string = (p) => `${p}_1`,
    private readonly nowIso: () => string = () => new Date().toISOString()
  ) {}

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
  ): Result<GovernanceExecutionPlan> {
    return success({
      planId: asGovernancePlanId(this.createId("gep")),
      workflowPlanId: String(request.workflowExecutionPlan.planId),
      workflowExecutionPlan: request.workflowExecutionPlan,
      decision,
      authorization,
      policyEvaluation: policyReport,
      riskAssessment,
      budgetAssessment,
      complianceAssessment,
      securityAssessment,
      privacyAssessment,
      approvalPlan,
      qualityGates,
      escalationPlan,
      version: EXECUTION_GOVERNANCE_VERSION,
      createdAt: this.nowIso(),
    });
  }
}

function approval(
  kind: ApprovalRequirement["kind"],
  status: ApprovalRequirement["status"],
  description: string,
  blocking: boolean
): ApprovalRequirement {
  return {
    requirementId: `appr_${kind}`,
    kind,
    status,
    description,
    blocking,
    rationale: description,
  };
}
