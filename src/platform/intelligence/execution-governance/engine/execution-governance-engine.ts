/**
 * Execution Governance Engine.
 */

import { failure, success, type Result } from "../../shared/result";
import { ValidationError } from "../../shared/errors";
import { asGovernanceResultId } from "../contracts/identifiers";
import type { GovernanceRequest } from "../contracts/request";
import type { GovernanceReport, GovernanceExplanation } from "../contracts/result";
import type {
  IExecutionGovernanceEngine,
  IPolicyRepository,
  IPolicyEvaluator,
  IRiskEngine,
  IBudgetEngine,
  IComplianceEvaluator,
  ISecurityEvaluator,
  IPrivacyEvaluator,
  IApprovalEngine,
  IQualityGateValidator,
  IGovernanceDecisionEngine,
  IAuthorizationEngine,
  IEscalationPlanner,
  IGovernancePlanBuilder,
} from "../interfaces/execution-governance";

export interface ExecutionGovernanceEngineDeps {
  readonly policyRepo: IPolicyRepository;
  readonly policyEvaluator: IPolicyEvaluator;
  readonly risk: IRiskEngine;
  readonly budget: IBudgetEngine;
  readonly compliance: IComplianceEvaluator;
  readonly security: ISecurityEvaluator;
  readonly privacy: IPrivacyEvaluator;
  readonly approval: IApprovalEngine;
  readonly qualityGates: IQualityGateValidator;
  readonly decision: IGovernanceDecisionEngine;
  readonly authorization: IAuthorizationEngine;
  readonly escalation: IEscalationPlanner;
  readonly planBuilder: IGovernancePlanBuilder;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export class ExecutionGovernanceEngine implements IExecutionGovernanceEngine {
  private readonly nowIso: () => string;
  private readonly clockMs: () => number;

  constructor(private readonly deps: ExecutionGovernanceEngineDeps) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.clockMs = deps.clockMs ?? (() => Date.now());
  }

  async evaluate(request: GovernanceRequest): Promise<Result<GovernanceReport>> {
    const start = this.clockMs();
    const invalid = this.validate(request);
    if (invalid) return failure(invalid);

    const policies = this.deps.policyRepo.list();
    if (!policies.ok) return policies;

    const policyReport = this.deps.policyEvaluator.evaluate(request, policies.value);
    if (!policyReport.ok) return policyReport;

    const riskAssessment = this.deps.risk.assess(request);
    if (!riskAssessment.ok) return riskAssessment;

    const budgetAssessment = this.deps.budget.assess(request);
    if (!budgetAssessment.ok) return budgetAssessment;

    const complianceAssessment = this.deps.compliance.evaluate(request);
    if (!complianceAssessment.ok) return complianceAssessment;

    const securityAssessment = this.deps.security.evaluate(request);
    if (!securityAssessment.ok) return securityAssessment;

    const privacyAssessment = this.deps.privacy.evaluate(request);
    if (!privacyAssessment.ok) return privacyAssessment;

    const approvalPlan = this.deps.approval.resolve(request, policyReport.value, riskAssessment.value);
    if (!approvalPlan.ok) return approvalPlan;

    const qualityGates = this.deps.qualityGates.validate(request);
    if (!qualityGates.ok) return qualityGates;

    const decision = this.deps.decision.decide(
      request,
      policyReport.value,
      riskAssessment.value,
      budgetAssessment.value,
      approvalPlan.value,
      qualityGates.value
    );
    if (!decision.ok) return decision;

    const authorization = this.deps.authorization.authorize(decision.value);
    if (!authorization.ok) return authorization;

    const escalationPlan = this.deps.escalation.plan(request, decision.value, riskAssessment.value);
    if (!escalationPlan.ok) return escalationPlan;

    const governancePlan = this.deps.planBuilder.build(
      request,
      decision.value,
      authorization.value,
      policyReport.value,
      riskAssessment.value,
      budgetAssessment.value,
      complianceAssessment.value,
      securityAssessment.value,
      privacyAssessment.value,
      approvalPlan.value,
      qualityGates.value,
      escalationPlan.value
    );
    if (!governancePlan.ok) return governancePlan;

    const explanation = buildExplanation(
      decision.value,
      policyReport.value,
      budgetAssessment.value,
      approvalPlan.value,
      riskAssessment.value,
      complianceAssessment.value
    );

    const durationMs = this.clockMs() - start;

    return success({
      resultId: asGovernanceResultId((this.deps.createId ?? defaultId)("gov")),
      request,
      governanceExecutionPlan: governancePlan.value,
      explanation,
      statistics: {
        policiesEvaluated: policyReport.value.evaluations.length,
        risksIdentified: riskAssessment.value.risks.length,
        approvalsRequired: approvalPlan.value.requirements.length,
        durationMs,
      },
      createdAt: this.nowIso(),
    });
  }

  async explain(request: GovernanceRequest): Promise<Result<GovernanceExplanation>> {
    const result = await this.evaluate(request);
    if (!result.ok) return result;
    return success(result.value.explanation);
  }

  private validate(request: GovernanceRequest): ValidationError | null {
    if (!request.requestId?.trim()) return new ValidationError("requestId required");
    if (!request.workflowExecutionPlan) return new ValidationError("workflowExecutionPlan required");
    return null;
  }
}

function defaultId(p: string): string {
  return `${p}_${Math.random().toString(36).slice(2)}`;
}

function buildExplanation(
  decision: import("../contracts/decision").GovernanceDecision,
  policyReport: import("../contracts/policies").PolicyEvaluationReport,
  budget: import("../contracts/budget").BudgetAssessment,
  approval: import("../contracts/approvals").GovernanceApprovalPlan,
  risk: import("../contracts/risk").RiskAssessment,
  compliance: import("../contracts/compliance").ComplianceAssessment
): GovernanceExplanation {
  return {
    approvalRationale:
      decision.kind === "approved" || decision.kind === "approved_with_conditions"
        ? "Execution approved based on governance evaluation"
        : "Execution not fully approved",
    blockRationale: decision.kind === "blocked" ? decision.reason : undefined,
    policyTriggers: policyReport.evaluations.filter((e) => !e.passed).map((e) => e.message),
    budgetThresholds: budget.withinBudget ? [] : [`Budget exceeded: $${budget.totalExecutionBudget.toFixed(2)}`],
    requiredApprovals: approval.pendingApprovals.map(String),
    riskFindings: risk.risks.filter((r) => r.severity !== "low").map((r) => r.reason),
    complianceFindings: compliance.checks.filter((c) => !c.passed).map((c) => c.requirement),
  };
}
