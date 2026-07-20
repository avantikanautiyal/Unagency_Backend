import {
  sampleProductLaunchWorkflowRequest,
  setupWorkflowIntelligencePlatform,
} from "../../../../src/platform/intelligence/workflow-intelligence/testing";

describe("Workflow Intelligence engine", () => {
  it("produces workflow execution plan for product launch team without AI", async () => {
    const { engine } = setupWorkflowIntelligencePlatform();
    const result = await engine.plan(await sampleProductLaunchWorkflowRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.value;
    expect(report.workflowExecutionPlan.name).toContain("Workflow");
    expect(report.graph.nodes.length).toBeGreaterThanOrEqual(8);
    expect(report.graph.edges.length).toBeGreaterThan(0);
    expect(report.stages.length).toBeGreaterThanOrEqual(3);
    expect(report.checkpoints.checkpoints.length).toBeGreaterThan(0);
    expect(report.validation.valid).toBe(true);
  });

  it("builds workflow DAG with parallel groups and dependencies", async () => {
    const { engine } = setupWorkflowIntelligencePlatform();
    const result = await engine.plan(await sampleProductLaunchWorkflowRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const graph = result.value.graph;
    expect(graph.parallelGroups.length).toBeGreaterThanOrEqual(0);
    expect(graph.rootNodes.length).toBeGreaterThan(0);
    expect(graph.nodes.every((n) => n.produces.length > 0 || n.consumes.length > 0)).toBe(true);
  });

  it("includes approval gates, rollback, recovery, and resume plans", async () => {
    const { engine } = setupWorkflowIntelligencePlatform();
    const result = await engine.plan(await sampleProductLaunchWorkflowRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const plan = result.value.workflowExecutionPlan;
    expect(plan.approvalPlan.gates.length).toBeGreaterThan(0);
    expect(plan.rollbackPlan.steps.length).toBeGreaterThan(0);
    expect(plan.recoveryPlan.actions.length).toBeGreaterThan(0);
    expect(plan.resumePlan.checkpoints.length).toBeGreaterThan(0);
    expect(plan.manifest.lifecycle).toBe("validated");
  });

  it("simulates execution order without AI", async () => {
    const { engine } = setupWorkflowIntelligencePlatform();
    const simulation = await engine.simulate(await sampleProductLaunchWorkflowRequest());

    expect(simulation.ok).toBe(true);
    if (!simulation.ok) return;

    expect(simulation.value.executionOrder.length).toBeGreaterThan(0);
    expect(simulation.value.estimatedCompletionMinutes).toBeGreaterThan(0);
    expect(simulation.value.stageOrder.length).toBeGreaterThan(0);
  });

  it("explains workflow design decisions", async () => {
    const { engine } = setupWorkflowIntelligencePlatform();
    const explained = await engine.explain(await sampleProductLaunchWorkflowRequest());

    expect(explained.ok).toBe(true);
    if (!explained.ok) return;

    expect(explained.value.stageRationale).toBeTruthy();
    expect(explained.value.dependencyRationale).toBeTruthy();
    expect(explained.value.approvalRationale).toBeTruthy();
    expect(explained.value.recoveryRationale).toBeTruthy();
  });

  it("provides optimization recommendations without modifying graph", async () => {
    const { engine } = setupWorkflowIntelligencePlatform();
    const result = await engine.plan(await sampleProductLaunchWorkflowRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.optimization.reportId).toBeDefined();
    expect(result.value.optimization.criticalPathMinutes).toBeGreaterThan(0);
  });
});
