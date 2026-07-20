import {
  sampleSneakerLaunchRequest,
  setupTaskIntelligencePlatform,
} from "../../../../src/platform/intelligence/task-intelligence/testing";

describe("Task Intelligence engine", () => {
  it("produces full task intelligence report for sneaker launch without AI", async () => {
    const { engine } = setupTaskIntelligencePlatform();
    const result = await engine.analyze(sampleSneakerLaunchRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.value;
    expect(report.businessObjective.title).toContain("Product Launch");
    expect(report.intentProfile.primaryIntent).toBeDefined();
    expect(report.departmentClassification.primary).toBe("marketing");
    expect(report.domainClassification.primary).toBe("retail");
    expect(report.taskGraph.nodes.length).toBeGreaterThanOrEqual(10);
    expect(report.capabilityMap.requirements.length).toBeGreaterThanOrEqual(10);
    expect(report.deliverablePlan.items.length).toBeGreaterThan(0);
    expect(report.complexityProfile.tier).toMatch(/moderate|complex|enterprise/);
    expect(report.executionConstraints).toBeDefined();
    expect(report.reviewPlan.checkpoints.length).toBeGreaterThan(0);
    expect(report.taskExecutionPlan.stages.length).toBeGreaterThan(0);
    expect(report.structuredTaskPlan.version).toBe("1.0.0");
    expect(report.explanation.decompositionRationale).toContain("playbook");
  });

  it("builds task DAG with dependencies", async () => {
    const { engine } = setupTaskIntelligencePlatform();
    const result = await engine.analyze(sampleSneakerLaunchRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const dag = result.value.taskGraph.dependencyGraph;
    expect(dag.edges.length).toBeGreaterThan(0);
    expect(dag.parallelGroups.length).toBeGreaterThan(0);
    expect(dag.nodes.length).toBe(result.value.taskGraph.nodes.length);
  });

  it("explains classification and decomposition", async () => {
    const { engine } = setupTaskIntelligencePlatform();
    const explained = await engine.explain(sampleSneakerLaunchRequest());

    expect(explained.ok).toBe(true);
    if (!explained.ok) return;

    expect(explained.value.classificationRationale).toBeTruthy();
    expect(explained.value.capabilityRationale).toBeTruthy();
    expect(explained.value.dependencyRationale).toBeTruthy();
    expect(explained.value.reviewRationale).toBeTruthy();
    expect(explained.value.qualityRationale).toBeTruthy();
  });

  it("includes expected deliverables for launch workflow", async () => {
    const { engine } = setupTaskIntelligencePlatform();
    const result = await engine.analyze(sampleSneakerLaunchRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const names = result.value.deliverablePlan.items.map((d) => d.name.toLowerCase());
    expect(names.some((n) => n.includes("carousel") || n.includes("instagram"))).toBe(true);
    expect(names.some((n) => n.includes("email") || n.includes("campaign"))).toBe(true);
    expect(result.value.deliverablePlan.reviewChecklist.length).toBeGreaterThan(0);
  });
});
