import {
  sampleAcmeManifest,
  sampleGenerationRequest,
  setupProviderGenerator,
} from "../../../../src/platform/intelligence/provider-generator/testing";
import { ProviderGenerationRequestBuilder } from "../../../../src/platform/intelligence/provider-generator/builders/generation-request-builder";
import { REQUIRED_ARTIFACT_KINDS } from "../../../../src/platform/intelligence/provider-generator/constants";

describe("Universal Provider Generator", () => {
  it("generates a complete provider package from a manifesto", async () => {
    const { engine } = setupProviderGenerator();
    const result = await engine.generate(sampleGenerationRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const pkg = result.value.package;
    expect(pkg.providerId).toBe("acme");
    expect(pkg.files.length).toBeGreaterThanOrEqual(REQUIRED_ARTIFACT_KINDS.length);

    const paths = pkg.files.map((f) => f.relativePath);
    expect(paths).toEqual(
      expect.arrayContaining([
        "factories/create-acme-provider.ts",
        "discovery/model-discovery.ts",
        "models/model-resolver.ts",
        "models/capability-mapper.ts",
        "dispatcher/acme-dispatcher.ts",
        "index.ts",
        "README.md",
      ])
    );

    const factory = pkg.files.find((f) => f.kind === "factory")!;
    expect(factory.content).toContain("discoverModels");
    expect(factory.content).toContain("resolveModel");
    expect(factory.content).toContain("createAcmeProvider");

    const discovery = pkg.files.find((f) => f.kind === "discovery")!;
    expect(discovery.content).toContain("discover");
    expect(discovery.content).not.toMatch(/gpt-4|claude-3|gemini-1/);

    const resolver = pkg.files.find((f) => f.kind === "model_resolver")!;
    expect(resolver.content).toContain("DesiredCapabilityProfile");
    expect(resolver.content).toContain("resolve(");

    expect(pkg.integrationChecklist.length).toBeGreaterThanOrEqual(10);
    expect(pkg.certificationChecklist).toContain("manifest_validation");
  });

  it("rejects invalid manifests", async () => {
    const { engine } = setupProviderGenerator();
    const bad = sampleAcmeManifest();
    const result = await engine.generate(
      ProviderGenerationRequestBuilder.create()
        .withRequestId("bad")
        .withManifest({
          ...bad,
          providerId: "INVALID",
          capabilityMatrix: [{ capabilityId: "notcanonical", modalities: ["text"], requiredFeatures: [] }],
        })
        .build()
    );
    expect(result.ok).toBe(false);
  });

  it("maps capability-first ids only", async () => {
    const { engine } = setupProviderGenerator();
    const result = await engine.generate(sampleGenerationRequest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const mapper = result.value.package.files.find((f) => f.kind === "capability_mapper")!;
    expect(mapper.content).toContain("marketing.copywriting");
    expect(mapper.content).toContain("software.code_generation");
  });

  it("does not emit anthropic or gemini packages", async () => {
    const { engine } = setupProviderGenerator();
    const result = await engine.generate(sampleGenerationRequest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.package.providerId).toBe("acme");
    expect(result.value.package.providerId).not.toMatch(/anthropic|gemini|groq/i);
  });
});
