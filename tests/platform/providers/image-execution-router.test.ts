import { ImageExecutionRouter } from "../../../src/platform/providers/image/routing/image-execution-router";
import type { IProviderRuntimeRegistry } from "../../../src/platform/providers/runtime/registry/in-memory-provider-runtime-registry";

function mockRegistry(providerIds: string[]): IProviderRuntimeRegistry {
  return {
    listAvailableProviderIds: () => providerIds,
    resolveAvailable: (id: string) =>
      providerIds.includes(String(id))
        ? { capabilities: ["image.generate"] }
        : undefined,
  } as unknown as IProviderRuntimeRegistry;
}

describe("ImageExecutionRouter", () => {
  const router = new ImageExecutionRouter(
    mockRegistry([
      "provider.openai",
      "provider.google",
      "provider.ideogram",
    ])
  );

  it("honours client provider pin when LIVE", () => {
    const routed = router.resolve({
      prompt: "Instagram post for DiVastra",
      preferredProviderId: "provider.google",
      preferredModelId: "gemini-3-pro-image",
    });
    expect(routed.ok).toBe(true);
    if (routed.ok) {
      expect(routed.value.providerId).toBe("provider.google");
      expect(routed.value.modelId).toBe("gemini-3-pro-image");
    }
  });

  it("assigns distinct providers per routeVisualSlot for parallel fan-out", () => {
    const slot0 = router.resolve({
      prompt: "Instagram post for DiVastra with attached logo",
      preferredProviderId: "provider.recraft",
      routeVisualSlot: 0,
      service: "Social Media",
      platform: "Instagram",
    });
    const slot1 = router.resolve({
      prompt: "Instagram post for DiVastra with attached logo",
      preferredProviderId: "provider.openai",
      routeVisualSlot: 1,
      service: "Social Media",
      platform: "Instagram",
    });
    expect(slot0.ok && slot1.ok).toBe(true);
    if (slot0.ok && slot1.ok) {
      expect(slot0.value.providerId).toBe("provider.openai");
      expect(slot1.value.providerId).toBe("provider.google");
      expect(slot0.value.providerId).not.toBe(slot1.value.providerId);
    }
  });

  it("falls back to the matching route slot when pinned provider is not LIVE", () => {
    const routed = router.resolve({
      prompt: "Instagram campaign creative",
      preferredProviderId: "provider.ideogram",
      preferredModelId: "ideogram-3",
      routeVisualSlot: 2,
    });
    expect(routed.ok).toBe(true);
    if (routed.ok) {
      expect(routed.value.providerId).toBe("provider.ideogram");
      expect(routed.value.modelId).toBe("ideogram-3");
    }
  });
});
