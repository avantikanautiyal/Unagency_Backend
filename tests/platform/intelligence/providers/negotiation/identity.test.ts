import {
  makeRequest,
  setupNegotiation,
} from "../../../../../src/platform/intelligence/providers/negotiation/testing";
import {
  createTestPlatform,
  standardCredentialInput,
} from "../../../../../src/platform/intelligence/providers/identity/testing";

describe("Identity validation (via Provider Identity Platform interface)", () => {
  it("validates through a wired identity engine and accepts", async () => {
    const identity = createTestPlatform();
    await identity.store.registerCredential(standardCredentialInput());

    const { engine } = setupNegotiation({
      identityEngine: identity.engine,
      negotiationProfile: { requireIdentityValidation: true },
    });

    const result = await engine.negotiate(makeRequest());
    if (!result.ok) throw result.error;
    expect(result.value.decision).not.toBe("rejected");
    expect(result.value.negotiated).toBeDefined();
    expect(
      result.value.evidence.some((e) => e.stage === "identity")
    ).toBe(true);
  });

  it("rejects when identity validation is required but no engine is configured", async () => {
    const { engine } = setupNegotiation({
      negotiationProfile: { requireIdentityValidation: true },
    });
    const result = await engine.negotiate(makeRequest());
    if (!result.ok) throw result.error;
    expect(result.value.decision).toBe("rejected");
    expect(
      result.value.failures.some((f) => f.code === "identity_unvalidated")
    ).toBe(true);
  });

  it("rejects when a required credential cannot be resolved", async () => {
    const identity = createTestPlatform();
    // No credential registered.
    const { engine } = setupNegotiation({
      identityEngine: identity.engine,
      negotiationProfile: { requireIdentityValidation: true },
    });
    const result = await engine.negotiate(makeRequest());
    if (!result.ok) throw result.error;
    expect(result.value.decision).toBe("rejected");
  });

  it("only warns about missing identity when validation is not required", async () => {
    const identity = createTestPlatform();
    const { engine } = setupNegotiation({
      identityEngine: identity.engine,
      negotiationProfile: { requireIdentityValidation: false },
    });
    const result = await engine.negotiate(makeRequest());
    if (!result.ok) throw result.error;
    expect(result.value.decision).toBe("accepted_with_warnings");
    expect(
      result.value.warnings.some((w) => w.code === "identity_unvalidated")
    ).toBe(true);
  });
});
