import {
  makeProfile,
  makeRequest,
  setupNegotiation,
  TEST_PROVIDER,
} from "../../../../../src/platform/intelligence/providers/negotiation/testing";

describe("Model & feature negotiation", () => {
  it("rejects when no capability profile is registered for the provider", async () => {
    const { engine, matrix } = setupNegotiation();
    matrix.clear();
    const result = await engine.negotiate(makeRequest());
    if (!result.ok) throw result.error;
    expect(result.value.decision).toBe("rejected");
    expect(result.value.failures.some((f) => f.code === "model_unavailable")).toBe(
      true
    );
  });

  it("derives model capabilities from the matrix + attributes", async () => {
    const { engine } = setupNegotiation();
    const result = await engine.negotiate(
      makeRequest({ routingConstraints: { requiredFeatures: ["reasoning"], excludedProviderIds: [] } })
    );
    if (!result.ok || !result.value.negotiated) throw new Error("expected negotiated");
    expect(result.value.negotiated.negotiatedFeatures).toContain("reasoning");
  });

  it("rejects a required feature the model does not support", async () => {
    const { engine } = setupNegotiation({
      profile: makeProfile({
        providerId: TEST_PROVIDER,
        features: {
          supportsText: true,
          supportsImage: false,
          supportsVideo: false,
          supportsEmbeddings: false,
          supportsModeration: false,
          supportsStreaming: false,
          supportsVision: false,
          supportsAudio: false,
          supportsFunctionCalling: false,
        },
        attributes: {},
      }),
    });
    const result = await engine.negotiate(
      makeRequest({
        routingConstraints: { requiredFeatures: ["vision"], excludedProviderIds: [] },
      })
    );
    if (!result.ok) throw result.error;
    expect(result.value.decision).toBe("rejected");
    expect(result.value.failures.some((f) => f.code === "feature_unsupported")).toBe(
      true
    );
  });

  it("maps unknown required feature strings to a warning, not a failure", async () => {
    const { engine } = setupNegotiation();
    const result = await engine.negotiate(
      makeRequest({
        routingConstraints: {
          requiredFeatures: ["telepathy"],
          excludedProviderIds: [],
        },
      })
    );
    if (!result.ok) throw result.error;
    expect(result.value.decision).not.toBe("rejected");
  });
});
