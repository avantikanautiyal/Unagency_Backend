import { createPlanningFixture, sampleRequest } from "./helpers";

describe("ExecutionPlanningEngine", () => {
  it("produces a valid execution plan", async () => {
    const { engine } = createPlanningFixture();
    const plan = await engine.produceExecutionPlan(sampleRequest());

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    expect(plan.value.planId).toMatch(/^plan_/);
    expect(String(plan.value.capabilityId)).toBe("analyzeBrief");
    expect(String(plan.value.providerSelection.primaryProviderId)).toBe(
      "provider-a"
    );
    expect(plan.value.executionMode).toBe("sequential");
    expect(plan.value.graph.nodes.length).toBeGreaterThan(1);
    expect(plan.value.metadata.correlationId).toBe("corr_1");
  });

  it("rejects invalid requests", () => {
    const { engine } = createPlanningFixture();
    const result = engine.validateRequest({
      capabilityId: "" as never,
      organizationId: "" as never,
      workspaceId: "" as never,
    });
    expect(result.ok).toBe(false);
  });

  it("fails when capability is missing", async () => {
    const { engine } = createPlanningFixture();
    const plan = await engine.produceExecutionPlan({
      ...sampleRequest(),
      capabilityId: "missing" as never,
    });
    expect(plan.ok).toBe(false);
  });

  it("includes human review node when required", async () => {
    const { engine } = createPlanningFixture({ humanReview: true });
    const plan = await engine.produceExecutionPlan(sampleRequest());
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    expect(plan.value.humanReview.required).toBe(true);
    expect(plan.value.executionStrategy).toBe("human_gated");
    expect(
      plan.value.graph.nodes.some((node) => node.kind === "human_review")
    ).toBe(true);
  });
});
