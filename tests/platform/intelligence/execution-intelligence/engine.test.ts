import {
  sampleExecutionIntelligenceRequest,
  setupExecutionIntelligencePlatform,
} from "../../../../src/platform/intelligence/execution-intelligence/testing";

describe("Execution Intelligence engine", () => {
  it("produces complete ExecutionIntelligenceResult without calling providers", async () => {
    const { engine } = setupExecutionIntelligencePlatform();
    const request = await sampleExecutionIntelligenceRequest();
    const result = await engine.optimize(request);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.strategy).toBeDefined();
    expect(result.value.mode).toBeDefined();
    expect(result.value.contextPlan).toBeDefined();
    expect(result.value.knowledgePlan).toBeDefined();
    expect(result.value.promptPlan).toBeDefined();
    expect(result.value.providerHints).toBeDefined();
    expect(result.value.budget.totalEstimated).toBeGreaterThan(0);
    expect(result.value.compressionPlan).toBeDefined();
    expect(result.value.reasoningPlan).toBeDefined();
    expect(result.value.decompositionPlan).toBeDefined();
    expect(result.value.prediction.quality.expectedQuality).toBeGreaterThan(0);
    expect(result.value.risks.length).toBeGreaterThan(0);
    expect(result.value.verificationPlan).toBeDefined();
    expect(result.value.optimizationReport).toBeDefined();
    expect(result.value.snapshot).toBeDefined();
    expect(result.value.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("selects preferred strategy when specified", async () => {
    const { engine } = setupExecutionIntelligencePlatform();
    const request = await sampleExecutionIntelligenceRequest({
      strategy: "reasoning_first",
    });
    const result = await engine.optimize(request);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.strategy.kind).toBe("reasoning_first");
    expect(result.value.reasoningPlan.enabled).toBe(true);
  });

  it("enables verification when requested", async () => {
    const { engine } = setupExecutionIntelligencePlatform();
    const request = await sampleExecutionIntelligenceRequest({
      enableVerification: true,
    });
    const result = await engine.optimize(request);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.verificationPlan.enabled).toBe(true);
    expect(result.value.verificationPlan.steps.length).toBeGreaterThan(0);
  });

  it("explains heuristics for a request", async () => {
    const { engine } = setupExecutionIntelligencePlatform();
    const request = await sampleExecutionIntelligenceRequest();
    const explained = await engine.explain(request);

    expect(explained.ok).toBe(true);
    if (!explained.ok) return;
    expect(explained.value.length).toBeGreaterThan(0);
    expect(explained.value[0].kind).toBeDefined();
  });

  it("rejects invalid requests", async () => {
    const { engine } = setupExecutionIntelligencePlatform();
    const request = await sampleExecutionIntelligenceRequest();
    const invalid = { ...request, requestId: "" };
    const result = await engine.optimize(invalid);

    expect(result.ok).toBe(false);
  });

  it("produces provider adaptation hints without SDK logic", async () => {
    const { engine } = setupExecutionIntelligencePlatform();
    const request = await sampleExecutionIntelligenceRequest();
    const result = await engine.optimize(request);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.providerHints.preferredFormatting).toBeDefined();
    expect(result.value.providerHints.hints.length).toBeGreaterThan(0);
  });
});
