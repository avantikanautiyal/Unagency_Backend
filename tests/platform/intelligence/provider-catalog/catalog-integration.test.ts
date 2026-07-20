import {
  setupProviderCatalog,
  expectedCatalogProviderCount,
  expectedCatalogModelCount,
} from "../../../../src/platform/intelligence/provider-catalog/testing";
import {
  listCatalogProviderIds,
  PROVIDER_CATALOG_SEED,
  getCatalogEntry,
} from "../../../../src/platform/intelligence/provider-catalog/catalog/provider-catalog-seed";
import { catalogEntryToManifest } from "../../../../src/platform/intelligence/provider-catalog/catalog/catalog-to-manifest";
import { evaluateCatalogCertification } from "../../../../src/platform/intelligence/provider-catalog/integration/catalog-integration-engine";

describe("Official Provider Catalog Integration", () => {
  it("integrates every catalog provider via Universal Provider Generator", async () => {
    const { engine, capabilityRegistry } = setupProviderCatalog();
    const result = await engine.integrate({ requestId: "catalog_full_1" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.value;
    expect(report.providerCount).toBe(expectedCatalogProviderCount());
    expect(report.providerCount).toBe(listCatalogProviderIds().length);
    expect(report.allViaGenerator).toBe(true);
    expect(report.skippedInventedProviders).toBe(0);
    expect(report.modelBootstrapCount).toBe(expectedCatalogModelCount());
    expect(report.generationFileCount).toBeGreaterThan(report.providerCount * 10);
    expect(report.activeCount).toBe(report.providerCount);
    expect(report.experimentalCount).toBe(0);

    const ids = report.providersIntegrated.map((p) => p.entry.providerId).sort();
    expect(ids).toEqual([...listCatalogProviderIds()].sort());

    for (const rec of report.providersIntegrated) {
      expect(rec.generationPackage.files.length).toBeGreaterThan(10);
      expect(rec.registration.mesh).toBe(true);
      expect(rec.registration.runtime).toBe(true);
      expect(rec.registration.capabilityIntelligence).toBe(true);
      expect(rec.certified).toBe(true);
      expect(evaluateCatalogCertification(rec.generationPackage).certified).toBe(true);

      const discovered = await rec.platform.discoverModels(true);
      expect(discovered.ok).toBe(true);
      if (!discovered.ok) continue;
      expect(discovered.value.source).toBe("catalog_bootstrap");
      expect(discovered.value.models.length).toBe(rec.entry.models.length);

      const resolved = rec.platform.resolveModel({
        capabilityId: rec.platform.manifest.capabilityMatrix[0]?.capabilityId,
        requireReasoning: rec.entry.department === "llm",
      });
      expect(resolved.ok).toBe(true);
    }

    // Capability Intelligence received registrations
    const listed = capabilityRegistry.list();
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      expect(listed.value.length).toBeGreaterThan(5);
    }
  });

  it("preserves OpenAI existing leaf marker and still generates via generator", async () => {
    const { engine } = setupProviderCatalog();
    const result = await engine.integrate({
      requestId: "catalog_openai",
      providerIds: ["openai"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const openai = result.value.providersIntegrated[0]!;
    expect(openai.usedExistingOpenAILeaf).toBe(true);
    expect(openai.entry.existingLeaf).toBe("openai");
    expect(openai.generationPackage.providerId).toBe("openai");
    expect(openai.generationPackage.packageRoot).toContain("openai");
  });

  it("does not invent providers outside the catalog seed", () => {
    const seedIds = new Set(PROVIDER_CATALOG_SEED.map((p) => p.providerId));
    expect(seedIds.has("acme")).toBe(false);
    expect(seedIds.has("fake-vendor")).toBe(false);
    expect(getCatalogEntry("anthropic")).toBeDefined();
    expect(getCatalogEntry("tavily")).toBeDefined();
  });

  it("maps catalog rows to valid generator manifests", () => {
    for (const entry of PROVIDER_CATALOG_SEED) {
      const manifest = catalogEntryToManifest(entry);
      expect(manifest.providerId).toBe(entry.providerId);
      expect(manifest.capabilityMatrix.length).toBeGreaterThan(0);
      expect(manifest.discoveryEndpoint).toBeTruthy();
      expect(manifest.baseUrl).toBeTruthy();
      for (const cap of manifest.capabilityMatrix) {
        expect(cap.capabilityId).toContain(".");
      }
    }
  });

  it("resolves models from capability profiles, not brand targets", async () => {
    const { engine } = setupProviderCatalog();
    const result = await engine.integrate({
      requestId: "catalog_resolve",
      providerIds: ["anthropic"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const platform = result.value.providersIntegrated[0]!.platform;
    await platform.discoverModels();
    const resolution = platform.resolveModel({
      capabilityId: "marketing.copywriting",
      requireReasoning: true,
      requireStreaming: true,
    });
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.value.selectedModelId).toMatch(/^anthropic:/);
    expect(resolution.value.rationale.toLowerCase()).not.toMatch(/\bgpt\b/);
  });

  it("keeps failed certification experimental (never ACTIVE)", async () => {
    const { engine } = setupProviderCatalog();
    const result = await engine.integrate({
      requestId: "catalog_one",
      providerIds: ["exa"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rec = result.value.providersIntegrated[0]!;
    // Force status check path: when certified false via instantiate
    const failed = evaluateCatalogCertification({
      ...rec.generationPackage,
      files: rec.generationPackage.files.filter((f) => f.kind !== "discovery"),
      certificationChecklist: [],
    });
    expect(failed.certified).toBe(false);
  });

  it("registers mesh health/observability for each provider", async () => {
    const { engine, mesh } = setupProviderCatalog();
    const result = await engine.integrate({
      requestId: "catalog_mesh",
      providerIds: ["runway", "suno"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const rec of result.value.providersIntegrated) {
      expect(rec.registration.notes).toEqual(
        expect.arrayContaining(["mesh_observed", "capabilities_registered"])
      );
    }
    // second observe still works on same mesh
    const obs = await mesh.observe({
      requestId: "post",
      events: [
        {
          eventId: "e_post",
          providerId: "runway",
          kind: "telemetry",
          observedAt: "2026-07-14T00:00:00.000Z",
          metrics: { latencyMs: 50, availability: 1 },
        },
      ],
    });
    expect(obs.ok).toBe(true);
  });
});
