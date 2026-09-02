/**
 * Async media routing should honor prepass pins (Wave 3).
 */

import {
  failoverChainFromMetadata,
  resolveAsyncMediaRoutingPins,
} from "../../../src/platform/api/services/async-media-routing-pins";

describe("async prepass routing pins", () => {
  it("prefers workingMetadata preferred* over metadata providerId", () => {
    const pins = resolveAsyncMediaRoutingPins({
      workingMetadata: {
        preferredProviderId: "provider.openai",
        preferredModelId: "gpt-image-1",
      },
      metadata: {
        providerId: "provider.other",
        modelId: "other-model",
      },
    });
    expect(pins.prepassPinned).toBe(true);
    expect(pins.preferredProviderId).toBe("provider.openai");
    expect(pins.preferredModelId).toBe("gpt-image-1");
  });

  it("is not pinned when model is missing", () => {
    const pins = resolveAsyncMediaRoutingPins({
      workingMetadata: { preferredProviderId: "provider.openai" },
    });
    expect(pins.prepassPinned).toBe(false);
  });

  it("parses failover chains from metadata", () => {
    expect(
      failoverChainFromMetadata({
        imageFailoverChain: [
          { providerId: "provider.a", modelId: "m1" },
          { providerId: "bad" },
          { providerId: "provider.b", modelId: "m2" },
        ],
      })
    ).toEqual([
      { providerId: "provider.a", modelId: "m1" },
      { providerId: "provider.b", modelId: "m2" },
    ]);
  });
});
