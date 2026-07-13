import {
  makeCapability,
  makeRequest,
  setupNegotiation,
} from "../../../../../src/platform/intelligence/providers/negotiation/testing";
import { DefaultPolicyProvider } from "../../../../../src/platform/intelligence/providers/negotiation/policies/default-policy-provider";
import { computeConfidence, decide } from "../../../../../src/platform/intelligence/providers/negotiation/negotiation/decision";

describe("Policy negotiation", () => {
  it("rejects when a consulted policy is denied", async () => {
    const { engine } = setupNegotiation({
      capability: makeCapability({
        policies: { executionPolicy: { policyId: "policy-strict" } },
      }),
      engineOptions: {
        policyProvider: new DefaultPolicyProvider(["policy-strict"]),
      },
    });
    const result = await engine.negotiate(makeRequest());
    if (!result.ok) throw result.error;
    expect(result.value.decision).toBe("rejected");
    expect(result.value.failures.some((f) => f.code === "policy_denied")).toBe(true);
  });

  it("consults plan-level policy refs", async () => {
    const { engine } = setupNegotiation();
    const result = await engine.negotiate(
      makeRequest({ executionPolicy: { policyRefs: ["p1", "p2"] } })
    );
    if (!result.ok || !result.value.negotiated) throw new Error("expected negotiated");
    expect(
      result.value.evidence.some((e) => e.stage === "policy")
    ).toBe(true);
  });
});

describe("Confidence & decision math", () => {
  it("computes confidence from failures and warnings", () => {
    expect(computeConfidence([], [])).toBe(1);
    expect(
      computeConfidence([], [{ code: "w", message: "m", stage: "provider" }])
    ).toBe(0.9);
    expect(
      computeConfidence(
        [{ code: "f", message: "m", stage: "provider" }],
        []
      )
    ).toBe(0.6);
  });

  it("derives the decision from diagnostics", () => {
    expect(decide([], [])).toBe("accepted");
    expect(decide([], [{ code: "w", message: "m", stage: "model" }])).toBe(
      "accepted_with_warnings"
    );
    expect(
      decide([{ code: "f", message: "m", stage: "model" }], [])
    ).toBe("rejected");
  });

  it("returns a Result failure for a malformed request (no plan)", async () => {
    const { engine } = setupNegotiation();
    // Force an invalid request shape.
    const result = await engine.negotiate({} as never);
    expect(result.ok).toBe(false);
  });
});
