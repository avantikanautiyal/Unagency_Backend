import {
  sampleExecutionIntelligenceRequest,
  setupExecutionIntelligencePlatform,
} from "../../../../src/platform/intelligence/execution-intelligence/testing";

describe("Execution Intelligence optimization", () => {
  it("produces token budget within configured maximum", async () => {
    const { engine } = setupExecutionIntelligencePlatform();
    const request = await sampleExecutionIntelligenceRequest({
      maxTokenBudget: 4096,
    });
    const result = await engine.optimize(request);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.budget.maximumContext).toBeLessThanOrEqual(4096);
  });

  it("reduces cost when prioritizeCost is set", async () => {
    const { engine } = setupExecutionIntelligencePlatform();
    const baseRequest = await sampleExecutionIntelligenceRequest();
    const costRequest = {
      ...baseRequest,
      preferences: { ...baseRequest.preferences, prioritizeCost: true },
    };

    const base = await engine.optimize(baseRequest);
    const cost = await engine.optimize(costRequest);

    expect(base.ok && cost.ok).toBe(true);
    if (!base.ok || !cost.ok) return;
    expect(cost.value.budget.totalEstimated).toBeLessThanOrEqual(
      base.value.budget.totalEstimated
    );
  });

  it("builds optimization report with recommendations", async () => {
    const { engine, benchmark } = setupExecutionIntelligencePlatform();
    const request = await sampleExecutionIntelligenceRequest();
    const result = await engine.optimize(request);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.optimizationReport.recommendations.length).toBeGreaterThan(0);

    const bench = benchmark.benchmark(request, result.value);
    expect(bench.ok).toBe(true);
    if (!bench.ok) return;
    expect(bench.value.expectedQuality).toBeGreaterThan(0);
  });
});
