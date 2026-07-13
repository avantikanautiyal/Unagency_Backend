import { DefaultSynchronizationEngine } from "../../../../../src/platform/intelligence/providers/integration/synchronization/default-synchronization-engine";
import { DefaultVersionManager } from "../../../../../src/platform/intelligence/providers/integration/versioning/default-version-manager";
import { InMemoryIntegrationRegistry } from "../../../../../src/platform/intelligence/providers/integration/registry/in-memory-integration-registry";
import { DefaultCompatibilityEngine } from "../../../../../src/platform/intelligence/providers/integration/compatibility/default-compatibility-engine";
import { makeManifest } from "../../../../../src/platform/intelligence/providers/adapters/testing";
import { asIntegrationId } from "../../../../../src/platform/intelligence/providers/integration/contracts/identifiers";

describe("Synchronization engine", () => {
  it("synchronizes feature and model inventories", () => {
    const registry = new InMemoryIntegrationRegistry(() => "2026-01-01T00:00:00.000Z");
    const versionManager = new DefaultVersionManager(() => "2026-01-01T00:00:00.000Z");
    const manifest = makeManifest();
    registry.register(manifest, asIntegrationId("int_1"));

    const sync = new DefaultSynchronizationEngine(registry, versionManager).synchronize(
      manifest.providerId,
      manifest
    );
    expect(sync.ok).toBe(true);
    if (!sync.ok) return;
    expect(sync.value.synchronized).toBe(true);
    expect(sync.value.featureInventory.capabilities).toContain("text.generate");
    expect(sync.value.registryUpdated).toBe(true);
  });
});

describe("Version manager", () => {
  it("tracks upgrade and downgrade paths", () => {
    const manager = new DefaultVersionManager();
    const manifest = makeManifest();
    const tracked = manager.track(manifest.providerId, "1.0.0", "2.0.0");
    expect(tracked.ok).toBe(true);
    if (tracked.ok) {
      expect(tracked.value.compatibility).toBe("upgrade_required");
      expect(tracked.value.upgradePath).toEqual(["1.0.0", "2.0.0"]);
    }
  });
});

describe("Compatibility engine", () => {
  it("validates manifest structure", () => {
    const engine = new DefaultCompatibilityEngine();
    const manifest = makeManifest();
    const report = engine.validate(manifest);
    expect(report.ok).toBe(true);
    if (report.ok) expect(report.value.compatible).toBe(true);
  });
});
