import { DefaultDiscoveryEngine } from "../../../../../src/platform/intelligence/providers/integration/discovery/default-discovery-engine";
import { InMemoryIntegrationRegistry } from "../../../../../src/platform/intelligence/providers/integration/registry/in-memory-integration-registry";
import { makeManifest } from "../../../../../src/platform/intelligence/providers/adapters/testing";
import { asIntegrationId } from "../../../../../src/platform/intelligence/providers/integration/contracts/identifiers";

describe("Discovery engine", () => {
  it("discovers models, capabilities, regions, and limits from manifests", () => {
    const registry = new InMemoryIntegrationRegistry(() => "2026-01-01T00:00:00.000Z");
    const manifest = makeManifest();
    registry.register(manifest, asIntegrationId("int_1"));

    const discovery = new DefaultDiscoveryEngine(registry);
    const result = discovery.discover(manifest.providerId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.modalities).toContain("text");
    expect(result.value.models).toContain("test-model");
    expect(result.value.versions).toContain("1.0.0");
  });

  it("discovers all registered providers", () => {
    const registry = new InMemoryIntegrationRegistry();
    const manifest = makeManifest();
    registry.register(manifest, asIntegrationId("int_1"));
    const all = new DefaultDiscoveryEngine(registry).discoverAll();
    expect(all.ok).toBe(true);
    if (all.ok) expect(all.value).toHaveLength(1);
  });
});
