import { createSdkPlatform } from "../../../../../src/platform/intelligence/providers/sdk/factories/create-sdk-platform";

describe("SDK platform factory", () => {
  it("wires engine, registry, diagnostics, health, streaming, and auth", () => {
    const platform = createSdkPlatform();
    expect(platform.engine).toBeDefined();
    expect(platform.registry.list().length).toBe(11);
    expect(platform.diagnostics).toBeDefined();
    expect(platform.healthMonitor).toBeDefined();
    expect(platform.streamingEngine).toBeDefined();
    expect(platform.authProvider).toBeDefined();
  });

  it("can start without placeholder registration", () => {
    const platform = createSdkPlatform({ registerPlaceholders: false });
    expect(platform.registry.list()).toHaveLength(0);
  });
});
