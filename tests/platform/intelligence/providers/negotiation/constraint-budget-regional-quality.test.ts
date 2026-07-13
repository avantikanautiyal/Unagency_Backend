import {
  makeCapability,
  makeProvider,
  makeRequest,
  setupNegotiation,
} from "../../../../../src/platform/intelligence/providers/negotiation/testing";

describe("Constraint negotiation", () => {
  it("caps timeout to the provider limit and warns", async () => {
    const { engine } = setupNegotiation({
      provider: makeProvider({
        timeoutLimits: { defaultTimeoutMs: 30000, maxTimeoutMs: 60000 },
      }),
    });
    const result = await engine.negotiate(
      makeRequest({ timeout: { timeoutMs: 90000 } })
    );
    if (!result.ok || !result.value.negotiated) throw new Error("expected negotiated");
    expect(result.value.decision).toBe("accepted_with_warnings");
    expect(result.value.warnings.some((w) => w.code === "timeout_capped")).toBe(true);
    expect(
      result.value.negotiated.executionProfile.timeoutPolicy.executionTimeoutMs
    ).toBe(60000);
  });
});

describe("Budget negotiation", () => {
  it("rejects when planned cost exceeds the capability ceiling", async () => {
    const { engine } = setupNegotiation({
      capability: makeCapability({ costLimit: { maxCost: 1, currency: "USD" } }),
    });
    const result = await engine.negotiate(
      makeRequest({ budget: { maxCost: 5, currency: "USD" } })
    );
    if (!result.ok) throw result.error;
    expect(result.value.decision).toBe("rejected");
    expect(result.value.failures.some((f) => f.code === "budget_exceeded")).toBe(
      true
    );
  });

  it("respects an explicit request cost ceiling", async () => {
    const { engine } = setupNegotiation();
    const result = await engine.negotiate(
      makeRequest({ budget: { maxCost: 2, currency: "USD" } }, { costCeiling: 1 })
    );
    if (!result.ok) throw result.error;
    expect(result.value.decision).toBe("rejected");
  });
});

describe("Regional negotiation", () => {
  it("rejects a region the provider does not serve", async () => {
    const { engine } = setupNegotiation();
    const result = await engine.negotiate(
      makeRequest({}, { region: "ap-south-1" })
    );
    if (!result.ok) throw result.error;
    expect(result.value.decision).toBe("rejected");
    expect(result.value.failures.some((f) => f.code === "region_denied")).toBe(true);
  });

  it("allows a supported region", async () => {
    const { engine } = setupNegotiation();
    const result = await engine.negotiate(
      makeRequest({}, { region: "us-east-1" })
    );
    if (!result.ok || !result.value.negotiated) throw new Error("expected negotiated");
    expect(result.value.negotiated.regional.allowed).toBe(true);
  });
});

describe("Quality negotiation", () => {
  it("rejects when capability risk exceeds the requested tolerance", async () => {
    const { engine } = setupNegotiation({
      capability: makeCapability({ securityClassification: "pii" }),
    });
    const result = await engine.negotiate(
      makeRequest({}, { quality: { maxRiskLevel: "low" } })
    );
    if (!result.ok) throw result.error;
    expect(result.value.decision).toBe("rejected");
    expect(result.value.failures.some((f) => f.code === "quality_unmet")).toBe(true);
  });

  it("reports the derived risk level on the negotiated execution", async () => {
    const { engine } = setupNegotiation({
      capability: makeCapability({ securityClassification: "confidential" }),
    });
    const result = await engine.negotiate(makeRequest());
    if (!result.ok || !result.value.negotiated) throw new Error("expected negotiated");
    expect(result.value.negotiated.quality.riskLevel).toBe("medium");
  });
});
