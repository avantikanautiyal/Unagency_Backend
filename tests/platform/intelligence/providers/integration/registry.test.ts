import { InMemoryIntegrationRegistry } from "../../../../../src/platform/intelligence/providers/integration/registry/in-memory-integration-registry";
import { makeManifest } from "../../../../../src/platform/intelligence/providers/adapters/testing";
import { asIntegrationId } from "../../../../../src/platform/intelligence/providers/integration/contracts/identifiers";

describe("Integration registry", () => {
  it("registers and resolves providers", () => {
    const registry = new InMemoryIntegrationRegistry(() => "2026-01-01T00:00:00.000Z");
    const manifest = makeManifest();
    const reg = registry.register(manifest, asIntegrationId("int_1"));
    expect(reg.ok).toBe(true);
    expect(registry.has(manifest.providerId)).toBe(true);
    expect(registry.resolve(manifest.providerId).ok).toBe(true);
  });

  it("rejects duplicate registration and supports remove", () => {
    const registry = new InMemoryIntegrationRegistry();
    const manifest = makeManifest();
    registry.register(manifest, asIntegrationId("int_1"));
    expect(registry.register(manifest, asIntegrationId("int_2")).ok).toBe(false);
    expect(registry.remove(manifest.providerId).ok).toBe(true);
    expect(registry.resolve(manifest.providerId).ok).toBe(false);
  });
});
