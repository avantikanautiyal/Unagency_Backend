import {
  sampleSneakerLaunchAgentRequest,
  setupAgentPlanningPlatform,
} from "../../../../src/platform/intelligence/agent-planning/testing";

describe("Agent Planning engine", () => {
  it("produces Marketing Campaign Team for sneaker launch without AI", async () => {
    const { engine } = setupAgentPlanningPlatform();
    const request = await sampleSneakerLaunchAgentRequest();
    const result = await engine.plan(request);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.value;
    expect(report.executionTeamPlan.teamName).toContain("Marketing");
    expect(report.executionTeamPlan.teamMembers.length).toBeGreaterThanOrEqual(8);

    const roles = report.executionTeamPlan.teamMembers.map((m) => m.role);
    expect(roles).toContain("Market Research Analyst");
    expect(roles).toContain("Copywriter");
    expect(roles).toContain("QA Reviewer");
    expect(roles).toContain("Human Approval");
  });

  it("builds agent graph with dependencies", async () => {
    const { engine } = setupAgentPlanningPlatform();
    const result = await engine.plan(await sampleSneakerLaunchAgentRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const graph = result.value.agentGraph;
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.edges.length).toBeGreaterThan(0);
    expect(graph.humanApprovalRequired).toBe(true);
  });

  it("includes role assignments with fallbacks", async () => {
    const { engine } = setupAgentPlanningPlatform();
    const result = await engine.plan(await sampleSneakerLaunchAgentRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const assignments = result.value.roleAssignments.assignments;
    expect(assignments.length).toBeGreaterThanOrEqual(10);
    expect(assignments[0].fallbackRoles.length).toBeGreaterThan(0);
    expect(assignments[0].confidence).toBeGreaterThan(0);
  });

  it("produces communication plan, review hierarchy, and merge strategy", async () => {
    const { engine } = setupAgentPlanningPlatform();
    const result = await engine.plan(await sampleSneakerLaunchAgentRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.communicationPlan.artifactOnly).toBe(true);
    expect(result.value.reviewHierarchy.levels.length).toBeGreaterThanOrEqual(2);
    expect(result.value.mergePlan.steps.length).toBeGreaterThan(0);
    expect(result.value.coordinationPlan.primaryStrategy).toBeDefined();
    expect(result.value.escalationPlan.paths.length).toBeGreaterThan(0);
  });

  it("explains role selection and coordination", async () => {
    const { engine } = setupAgentPlanningPlatform();
    const explained = await engine.explain(await sampleSneakerLaunchAgentRequest());

    expect(explained.ok).toBe(true);
    if (!explained.ok) return;

    expect(explained.value.roleSelectionRationale).toBeTruthy();
    expect(explained.value.reviewHierarchyRationale).toBeTruthy();
    expect(explained.value.mergeStrategyRationale).toBeTruthy();
    expect(explained.value.playbookApplied).toBeDefined();
  });
});
