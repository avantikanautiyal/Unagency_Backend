import {
  sampleSneakerLaunchControlPlaneRequest,
  setupIntelligenceControlPlane,
} from "../../../../src/platform/intelligence/control-plane/testing";

describe("Intelligence Control Plane", () => {
  it("produces ExecutionReadyPlan for sneaker launch without providers or AI execution", async () => {
    const { engine } = setupIntelligenceControlPlane();
    const result = await engine.plan(sampleSneakerLaunchControlPlaneRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const plan = result.value.executionReadyPlan;
    expect(plan.structuredTaskPlan).toBeDefined();
    expect(plan.executionTeamPlan).toBeDefined();
    expect(plan.workflowExecutionPlan).toBeDefined();
    expect(plan.governanceExecutionPlan).toBeDefined();
    expect(plan.executionIntelligenceResult).toBeDefined();
    expect(plan.rankedModelCandidates.candidates.length).toBeGreaterThan(0);
    expect(plan.negotiationResult).toBeDefined();
    expect(plan.routingDecision.plan.primary).toBeDefined();
    expect(result.value.statistics.stagesExecuted).toBe(8);
  });

  it("maintains artifact chain through all stages", async () => {
    const { engine } = setupIntelligenceControlPlane();
    const result = await engine.plan(sampleSneakerLaunchControlPlaneRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const chain = result.value.artifacts;
    expect(chain.task).toBeDefined();
    expect(chain.team).toBeDefined();
    expect(chain.workflow).toBeDefined();
    expect(chain.governance).toBeDefined();
    expect(chain.executionIntelligence).toBeDefined();
    expect(chain.modelDecision).toBeDefined();
    expect(chain.negotiation).toBeDefined();
    expect(chain.routing).toBeDefined();
    expect(chain.executionReady).toBeDefined();
  });

  it("collects diagnostics with stage timings", async () => {
    const { engine } = setupIntelligenceControlPlane();
    const result = await engine.plan(sampleSneakerLaunchControlPlaneRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.diagnostics.stageTimings.length).toBe(8);
    expect(result.value.diagnostics.stageResults.length).toBeGreaterThan(0);
    expect(result.value.diagnostics.validationPassed).toBe(true);
  });

  it("produces unified explainability report", async () => {
    const { engine } = setupIntelligenceControlPlane();
    const explained = await engine.explain(sampleSneakerLaunchControlPlaneRequest());

    expect(explained.ok).toBe(true);
    if (!explained.ok) return;

    expect(explained.value.summary).toBeTruthy();
    expect(explained.value.taskRationale).toBeTruthy();
    expect(explained.value.modelRecommendationRationale).toBeTruthy();
    expect(explained.value.routingRationale).toBeTruthy();
    expect(Object.keys(explained.value.stageSummaries).length).toBeGreaterThanOrEqual(8);
  });

  it("supports dry-run simulation mode", async () => {
    const { engine } = setupIntelligenceControlPlane();
    const request = { ...sampleSneakerLaunchControlPlaneRequest(), mode: "simulate" as const };
    const result = await engine.plan(request);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.simulation?.providerExecution).toBe(false);
    expect(result.value.simulation?.stagesSimulated.length).toBe(8);
  });

  it("never passes RawRequest to downstream intelligence stages", async () => {
    const { engine } = setupIntelligenceControlPlane();
    const result = await engine.plan(sampleSneakerLaunchControlPlaneRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Execution intelligence request uses capability from task artifact, not raw prompt
    expect(result.value.artifacts.executionIntelligence?.result.requestId).toContain("_ei");
    expect(result.value.artifacts.modelDecision?.result.request.capabilityId).toBeDefined();
    expect(String(result.value.artifacts.modelDecision?.result.request.capabilityId)).not.toBe("");
  });
});
