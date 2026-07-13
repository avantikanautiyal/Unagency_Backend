import {
  sampleExecutionIntelligenceRequest,
  setupExecutionIntelligencePlatform,
} from "../../../../src/platform/intelligence/execution-intelligence/testing";

describe("Execution Intelligence risk and verification", () => {
  it("detects risks heuristically", async () => {
    const { engine } = setupExecutionIntelligencePlatform();
    const request = await sampleExecutionIntelligenceRequest();
    const result = await engine.optimize(request);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.risks.some((r) => r.category === "token_overflow")).toBe(true);
  });

  it("plans verification for low quality estimates", async () => {
    const { engine } = setupExecutionIntelligencePlatform();
    const request = await sampleExecutionIntelligenceRequest({
      enableVerification: true,
      strategy: "generate_review_improve",
    });
    const result = await engine.optimize(request);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.verificationPlan.enabled).toBe(true);
    expect(
      result.value.verificationPlan.steps.some((s) => s.kind === "self_review")
    ).toBe(true);
  });
});
