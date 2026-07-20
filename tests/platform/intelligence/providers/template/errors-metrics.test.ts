import { createTemplateError } from "../../../../../src/platform/intelligence/providers/template/contracts/errors";
import { setupTemplatePlatform } from "../../../../../src/platform/intelligence/providers/template/testing";

describe("Provider Template errors and metrics", () => {
  it("maps errors to canonical taxonomy", () => {
    const { errorMapper } = setupTemplatePlatform();
    const err = errorMapper.mapError(new Error("rate limit exceeded"));

    expect(err.templateKind).toBe("rate_limit");
    expect(err.kind).toBe("rate_limit");
    expect(err.retryable).toBe(true);
  });

  it("creates typed template errors", () => {
    const err = createTemplateError("authentication", "AUTH", "missing credentials", false);
    expect(err.kind).toBe("authentication");
    expect(err.templateKind).toBe("authentication");
  });

  it("collects metrics snapshot", () => {
    const { metrics } = setupTemplatePlatform();
    metrics.record({
      latencyMs: 100,
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
      retries: 0,
      toolCalls: 0,
      functionCalls: 0,
      estimatedCost: 0.001,
      success: true,
      cancelled: false,
      timedOut: false,
      collectedAt: new Date().toISOString(),
    });

    const snap = metrics.snapshot();
    expect(snap.ok).toBe(true);
    if (!snap.ok) return;
    expect(snap.value.totalRequests).toBe(1);
    expect(snap.value.successRate).toBe(1);
  });
});
