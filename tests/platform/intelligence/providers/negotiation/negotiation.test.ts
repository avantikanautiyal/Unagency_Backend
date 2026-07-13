import {
  makeCapability,
  makeProvider,
  makeProfile,
  makeRequest,
  setupNegotiation,
  TEST_FALLBACK_PROVIDER,
  TEST_PROVIDER,
} from "../../../../../src/platform/intelligence/providers/negotiation/testing";
import { projectToProviderExecutionRequest } from "../../../../../src/platform/intelligence/providers/negotiation/builders/negotiated-execution-projector";
import {
  asExecutionId,
  asOrganizationId,
  asWorkspaceId,
} from "../../../../../src/platform/intelligence/shared/identifiers";

describe("Negotiation engine — happy path & output", () => {
  it("accepts a valid plan and produces a NegotiatedExecution", async () => {
    const { engine } = setupNegotiation();
    const result = await engine.negotiate(makeRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.decision).toBe("accepted");
    expect(result.value.summary.confidence).toBe(1);

    const negotiated = result.value.negotiated;
    expect(negotiated).toBeDefined();
    expect(negotiated?.selectedProviderId).toBe(TEST_PROVIDER);
    expect(negotiated?.selectedModelId).toBe("gpt-model");
    expect(negotiated?.executionProfile.timeoutPolicy.executionTimeoutMs).toBe(
      30000
    );
    expect(negotiated?.executionProfile.retryPolicy.maxAttempts).toBe(2);
  });

  it("projects a NegotiatedExecution into a runtime-consumable request", async () => {
    const { engine } = setupNegotiation();
    const result = await engine.negotiate(makeRequest());
    if (!result.ok || !result.value.negotiated) throw new Error("expected negotiated");

    const req = projectToProviderExecutionRequest({
      negotiated: result.value.negotiated,
      executionId: asExecutionId("exec-1"),
      organizationId: asOrganizationId("org-1"),
      workspaceId: asWorkspaceId("ws-1"),
      payload: { prompt: "hello" },
      nowIso: () => "2026-01-01T00:00:00.000Z",
    });

    expect(req.providerId).toBe(TEST_PROVIDER);
    expect(req.capabilityId).toBe(result.value.negotiated.capabilityId);
    expect(req.retryPolicy.maxAttempts).toBe(2);
    expect(req.timeoutPolicy.executionTimeoutMs).toBe(30000);
    expect(req.context.providerId).toBe(TEST_PROVIDER);
  });

  it("includes healthy fallback candidates", async () => {
    const { engine } = setupNegotiation({
      capability: makeCapability({
        providerCompatibility: {
          compatibleProviderIds: [TEST_PROVIDER, TEST_FALLBACK_PROVIDER],
        },
      }),
      extraProviders: [
        makeProvider({
          id: TEST_FALLBACK_PROVIDER,
          vendor: "anthropic",
          supportedCapabilities: [makeCapability().id],
        }),
      ],
      extraProfiles: [makeProfile({ providerId: TEST_FALLBACK_PROVIDER })],
    });

    const result = await engine.negotiate(
      makeRequest({
        providerSelection: {
          primaryProviderId: TEST_PROVIDER,
          fallbackProviderIds: [TEST_FALLBACK_PROVIDER],
          modelId: "gpt-model",
        },
      })
    );

    if (!result.ok || !result.value.negotiated) throw new Error("expected negotiated");
    const candidates = result.value.negotiated.fallbackCandidates;
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.providerId).toBe(TEST_FALLBACK_PROVIDER);
  });
});
