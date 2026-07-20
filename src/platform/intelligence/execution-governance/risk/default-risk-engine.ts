/**
 * Risk, budget, compliance, security, privacy engines.
 */

import { success, type Result } from "../../shared/result";
import type { GovernanceRequest } from "../contracts/request";
import type { RiskAssessment, RiskItem } from "../contracts/risk";
import type { BudgetAssessment } from "../contracts/budget";
import type { ComplianceAssessment, SecurityAssessment, PrivacyAssessment } from "../contracts/compliance";
import type {
  IRiskEngine,
  IBudgetEngine,
  IComplianceEvaluator,
  ISecurityEvaluator,
  IPrivacyEvaluator,
} from "../interfaces/execution-governance";
import { DEFAULT_SAFETY_MARGIN } from "../constants";

export class DefaultRiskEngine implements IRiskEngine {
  constructor(private readonly createId: (prefix: string) => string = (p) => `${p}_1`) {}

  assess(request: GovernanceRequest): Result<RiskAssessment> {
    const plan = request.workflowExecutionPlan;
    const isLaunch = plan.name.toLowerCase().includes("launch") || plan.name.toLowerCase().includes("campaign");
    const nodeCount = plan.graph.nodes.length;

    const risks: RiskItem[] = [
      risk("business", isLaunch ? "medium" : "low", 0.8, "Product launch carries market exposure", "Validate campaign strategy before execution"),
      risk("brand", isLaunch ? "medium" : "low", 0.85, "Brand messaging must align with guidelines", "Brand approval gate required"),
      risk("financial", nodeCount > 8 ? "medium" : "low", 0.75, "Multi-agent workflow increases cost", "Monitor budget per stage"),
      risk("quality", plan.approvalPlan.gates.length < 2 ? "medium" : "low", 0.7, "Insufficient review gates may affect quality", "Ensure QA and human approval"),
      risk("execution", nodeCount > 10 ? "medium" : "low", 0.8, "Complex workflow increases execution risk", "Use checkpoint recovery plan"),
      risk("privacy", "low", 0.9, "Marketing content typically low PII exposure", "Avoid customer PII in generated content"),
      risk("operational", "low", 0.85, "Standard operational workflow", "Monitor parallel group completion"),
    ];

    const severities = risks.map((r) => r.severity);
    const overall = severities.includes("critical") ? "critical" : severities.includes("high") ? "high" : severities.includes("medium") ? "medium" : "low";

    return success({
      assessmentId: this.createId("risk"),
      risks,
      overallSeverity: overall,
      overallConfidence: 0.82,
      summary: `${risks.length} risks identified, overall ${overall}`,
    });
  }
}

export class DefaultBudgetEngine implements IBudgetEngine {
  constructor(private readonly createId: (prefix: string) => string = (p) => `${p}_1`) {}

  assess(request: GovernanceRequest): Result<BudgetAssessment> {
    const plan = request.workflowExecutionPlan;
    const nodeCount = plan.graph.nodes.length;

    const perStage = plan.stages.map((s) => ({
      stageName: s.name,
      estimatedModelCost: s.nodeIds.length * 20,
      estimatedProviderCost: s.nodeIds.length * 5,
      estimatedTokens: s.nodeIds.length * 6000,
    }));

    const perAgent = plan.graph.nodes.map((n) => ({
      agentRole: n.name,
      estimatedCost: 25,
      estimatedTokens: 8000,
    }));

    const modelCost = perStage.reduce((s, st) => s + st.estimatedModelCost, 0);
    const providerCost = perStage.reduce((s, st) => s + st.estimatedProviderCost, 0);
    const total = modelCost + providerCost;
    const safetyMargin = total * DEFAULT_SAFETY_MARGIN;
    const limit = request.budgetLimit ?? 500;

    return success({
      assessmentId: this.createId("budget"),
      expectedModelCost: modelCost,
      expectedProviderCost: providerCost,
      totalExecutionBudget: total + safetyMargin,
      perStageBudget: perStage,
      perAgentBudget: perAgent,
      fallbackBudget: total * 0.2,
      safetyMargin,
      withinBudget: total + safetyMargin <= limit,
      recommendations: total > limit * 0.8 ? ["Consider reducing parallel agents", "Use economy-tier models for research stage"] : [],
      rationale: `Estimated $${total.toFixed(2)} + ${(DEFAULT_SAFETY_MARGIN * 100).toFixed(0)}% safety margin`,
    });
  }
}

export class DefaultComplianceEvaluator implements IComplianceEvaluator {
  constructor(private readonly createId: (prefix: string) => string = (p) => `${p}_1`) {}

  evaluate(request: GovernanceRequest): Result<ComplianceAssessment> {
    const frameworks = (request.complianceFrameworks ?? ["internal", "gdpr"]) as import("../contracts/enums").ComplianceFramework[];
    const checks = frameworks.flatMap((fw) => [
      { checkId: this.createId("comp"), framework: fw, passed: true, requirement: `${fw.toUpperCase()} data handling`, finding: undefined },
      { checkId: this.createId("comp"), framework: fw, passed: true, requirement: `${fw.toUpperCase()} audit trail`, finding: undefined },
    ]);

    return success({
      assessmentId: this.createId("compliance"),
      checks,
      compliant: checks.every((c) => c.passed),
      frameworks,
      rationale: `Evaluated against ${frameworks.join(", ")} — placeholder evaluator`,
    });
  }
}

export class DefaultSecurityEvaluator implements ISecurityEvaluator {
  constructor(private readonly createId: (prefix: string) => string = (p) => `${p}_1`) {}

  evaluate(request: GovernanceRequest): Result<SecurityAssessment> {
    const checks = [
      { checkId: this.createId("sec"), area: "workspace_isolation", passed: true, description: "Workspace boundaries enforced" },
      { checkId: this.createId("sec"), area: "organization_isolation", passed: true, description: "Organization scope validated" },
      { checkId: this.createId("sec"), area: "artifact_permissions", passed: true, description: "Artifact access scoped to workflow" },
      { checkId: this.createId("sec"), area: "execution_permissions", passed: true, description: "Execution permissions validated" },
      { checkId: this.createId("sec"), area: "capability_permissions", passed: true, description: "Capability access within policy" },
    ];

    return success({
      assessmentId: this.createId("security"),
      checks,
      secure: checks.every((c) => c.passed),
      rationale: "Security checks passed — placeholder evaluator",
    });
  }
}

export class DefaultPrivacyEvaluator implements IPrivacyEvaluator {
  constructor(private readonly createId: (prefix: string) => string = (p) => `${p}_1`) {}

  evaluate(request: GovernanceRequest): Result<PrivacyAssessment> {
    const isLaunch = request.workflowExecutionPlan.name.toLowerCase().includes("launch");

    return success({
      assessmentId: this.createId("privacy"),
      findings: [
        { findingId: this.createId("priv"), classification: "internal", description: "Marketing workflow — internal classification", mitigation: "No PII in prompts" },
        ...(isLaunch ? [{ findingId: this.createId("priv2"), classification: "confidential" as const, description: "Pre-launch product details", mitigation: "Restrict artifact sharing" }] : []),
      ],
      piiExposure: false,
      regionRestrictions: request.regionHint ? [request.regionHint] : ["us"],
      dataResidency: request.regionHint ?? "us",
      rationale: "Privacy assessment — placeholder evaluator",
    });
  }
}

function risk(
  category: RiskItem["category"],
  severity: RiskItem["severity"],
  confidence: number,
  reason: string,
  mitigation: string
): RiskItem {
  return {
    riskId: `risk_${category}`,
    category,
    severity,
    confidence,
    reason,
    recommendedMitigation: mitigation,
  };
}
