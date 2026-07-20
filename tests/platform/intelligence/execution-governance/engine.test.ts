import {
  sampleProductLaunchGovernanceRequest,
  setupExecutionGovernancePlatform,
} from "../../../../src/platform/intelligence/execution-governance/testing";

describe("Execution Governance engine", () => {
  it("produces governance execution plan for product launch workflow without AI", async () => {
    const { engine } = setupExecutionGovernancePlatform();
    const result = await engine.evaluate(await sampleProductLaunchGovernanceRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.value;
    expect(report.governanceExecutionPlan.decision).toBeDefined();
    expect(report.governanceExecutionPlan.riskAssessment.risks.length).toBeGreaterThan(0);
    expect(report.governanceExecutionPlan.budgetAssessment.totalExecutionBudget).toBeGreaterThan(0);
    expect(report.governanceExecutionPlan.complianceAssessment.compliant).toBe(true);
    expect(report.governanceExecutionPlan.securityAssessment.secure).toBe(true);
    expect(report.governanceExecutionPlan.privacyAssessment).toBeDefined();
    expect(report.governanceExecutionPlan.approvalPlan.requirements.length).toBeGreaterThan(0);
  });

  it("evaluates configurable policies", async () => {
    const { engine } = setupExecutionGovernancePlatform();
    const result = await engine.evaluate(await sampleProductLaunchGovernanceRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const policyEval = result.value.governanceExecutionPlan.policyEvaluation;
    expect(policyEval.evaluations.length).toBeGreaterThan(0);
    expect(policyEval.evaluations.every((e) => e.policyId)).toBe(true);
  });

  it("produces governance decision with risk summary", async () => {
    const { engine } = setupExecutionGovernancePlatform();
    const result = await engine.evaluate(await sampleProductLaunchGovernanceRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const decision = result.value.governanceExecutionPlan.decision;
    expect(decision.kind).toMatch(/approved|pending_approval|approved_with_conditions/);
    expect(decision.riskSummary).toBeTruthy();
    expect(decision.explanation).toBeTruthy();
  });

  it("includes budget assessment with per-stage and per-agent estimates", async () => {
    const { engine } = setupExecutionGovernancePlatform();
    const result = await engine.evaluate(await sampleProductLaunchGovernanceRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const budget = result.value.governanceExecutionPlan.budgetAssessment;
    expect(budget.perStageBudget.length).toBeGreaterThan(0);
    expect(budget.perAgentBudget.length).toBeGreaterThan(0);
    expect(budget.safetyMargin).toBeGreaterThan(0);
  });

  it("explains governance decisions", async () => {
    const { engine } = setupExecutionGovernancePlatform();
    const explained = await engine.explain(await sampleProductLaunchGovernanceRequest());

    expect(explained.ok).toBe(true);
    if (!explained.ok) return;

    expect(explained.value.approvalRationale).toBeTruthy();
    expect(explained.value.requiredApprovals).toBeDefined();
    expect(explained.value.riskFindings).toBeDefined();
  });

  it("blocks execution when budget exceeded", async () => {
    const { engine } = setupExecutionGovernancePlatform();
    const base = await sampleProductLaunchGovernanceRequest();
    const result = await engine.evaluate({
      ...base,
      budgetLimit: 10,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.governanceExecutionPlan.decision.kind).toBe("blocked");
    expect(result.value.governanceExecutionPlan.authorization.authorized).toBe(false);
  });
});
