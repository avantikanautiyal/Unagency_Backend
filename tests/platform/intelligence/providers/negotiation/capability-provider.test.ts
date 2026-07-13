import {
  makeCapability,
  makeProvider,
  makeRequest,
  setupNegotiation,
  TEST_PROVIDER,
} from "../../../../../src/platform/intelligence/providers/negotiation/testing";
import { asProviderId } from "../../../../../src/platform/intelligence/shared/identifiers";

describe("Capability negotiation", () => {
  it("rejects when the capability does not exist", async () => {
    const { engine, capabilityRegistry } = setupNegotiation();
    capabilityRegistry.clear();
    const result = await engine.negotiate(makeRequest());
    if (!result.ok) throw result.error;
    expect(result.value.decision).toBe("rejected");
    expect(result.value.failures.some((f) => f.code === "capability_not_found")).toBe(
      true
    );
  });

  it("rejects a disabled capability", async () => {
    const { engine } = setupNegotiation({
      capability: makeCapability({ status: "disabled" }),
    });
    const result = await engine.negotiate(makeRequest());
    if (!result.ok) throw result.error;
    expect(result.value.decision).toBe("rejected");
    expect(result.value.failures.some((f) => f.code === "capability_disabled")).toBe(
      true
    );
  });

  it("warns on experimental capability but still accepts when allowed", async () => {
    const { engine } = setupNegotiation({
      capability: makeCapability({ status: "experimental" }),
      negotiationProfile: { allowExperimentalCapabilities: true },
    });
    const result = await engine.negotiate(makeRequest());
    if (!result.ok) throw result.error;
    expect(result.value.decision).toBe("accepted_with_warnings");
    expect(result.value.warnings.some((w) => w.code === "capability_immature")).toBe(
      true
    );
  });

  it("rejects when provider is not compatible with capability", async () => {
    const { engine } = setupNegotiation({
      capability: makeCapability({
        providerCompatibility: {
          compatibleProviderIds: [asProviderId("provider-other")],
        },
      }),
    });
    const result = await engine.negotiate(makeRequest());
    if (!result.ok) throw result.error;
    expect(result.value.decision).toBe("rejected");
  });
});

describe("Provider negotiation", () => {
  it("rejects an offline provider", async () => {
    const { engine } = setupNegotiation({
      provider: makeProvider({ status: "offline" }),
    });
    const result = await engine.negotiate(makeRequest());
    if (!result.ok) throw result.error;
    expect(result.value.decision).toBe("rejected");
    expect(
      result.value.failures.some((f) => f.code === "provider_unavailable")
    ).toBe(true);
  });

  it("rejects a provider excluded by routing constraints", async () => {
    const { engine } = setupNegotiation();
    const result = await engine.negotiate(
      makeRequest({
        routingConstraints: {
          requiredFeatures: [],
          excludedProviderIds: [TEST_PROVIDER],
        },
      })
    );
    if (!result.ok) throw result.error;
    expect(result.value.decision).toBe("rejected");
    expect(result.value.failures.some((f) => f.code === "provider_restricted")).toBe(
      true
    );
  });

  it("rejects an unhealthy provider when health is required", async () => {
    const { engine, health } = setupNegotiation({
      negotiationProfile: { requireHealthyProvider: true },
    });
    health.set({
      providerId: TEST_PROVIDER,
      status: "offline",
      checkedAt: "2026-01-01T00:00:00.000Z",
    });
    const result = await engine.negotiate(makeRequest());
    if (!result.ok) throw result.error;
    expect(result.value.decision).toBe("rejected");
    expect(result.value.failures.some((f) => f.code === "provider_unhealthy")).toBe(
      true
    );
  });
});
