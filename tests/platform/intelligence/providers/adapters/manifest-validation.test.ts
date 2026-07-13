import {
  makeAdapterMetadata,
  makeManifest,
} from "../../../../../src/platform/intelligence/providers/adapters/testing";
import { DefaultAdapterValidator } from "../../../../../src/platform/intelligence/providers/adapters/validation/default-adapter-validator";
import { ProviderManifestBuilder } from "../../../../../src/platform/intelligence/providers/adapters/builders/provider-manifest-builder";
import { ProviderModelBuilder } from "../../../../../src/platform/intelligence/providers/adapters/builders/provider-model-builder";
import { parseManifestVersion } from "../../../../../src/platform/intelligence/providers/adapters/contracts/identifiers";
import { asProviderId } from "../../../../../src/platform/intelligence/shared/identifiers";

const unwrap = <T>(r: { ok: boolean; value?: T; error?: unknown }): T => {
  if (!r.ok) throw r.error;
  return r.value as T;
};

describe("Manifest validation", () => {
  const validator = new DefaultAdapterValidator();

  it("accepts a complete manifest", () => {
    const result = unwrap(validator.validateManifest(makeManifest()));
    expect(result.valid).toBe(true);
  });

  it("flags manifests with no models via builder + validator", () => {
    // Build a manifest and strip models to simulate an incomplete manifest.
    const manifest = { ...makeManifest(), models: [] };
    const result = unwrap(validator.validateManifest(manifest));
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "manifest_models")).toBe(true);
  });

  it("reports completeness warnings for missing defaults", () => {
    const manifest = { ...makeManifest(), defaultModels: {} };
    const result = unwrap(validator.validateManifestCompleteness(manifest));
    expect(result.issues.some((i) => i.code === "manifest_default_models")).toBe(true);
  });

  it("validates model compatibility and rejects unknown models", () => {
    const result = unwrap(
      validator.validateModelCompatibility(makeManifest(), { modelId: "ghost" })
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "model_unknown")).toBe(true);
  });

  it("rejects unsupported features", () => {
    const result = unwrap(
      validator.validateFeatureCompatibility(makeManifest(), ["vision"])
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "feature_unsupported")).toBe(true);
  });

  it("validates streaming compatibility", () => {
    const ok = unwrap(
      validator.validateStreamingCompatibility(makeManifest(), "test-model")
    );
    expect(ok.valid).toBe(true);
  });

  it("detects provider/manifest id mismatch on adapters", () => {
    const descriptor = {
      metadata: makeAdapterMetadata({ providerId: asProviderId("other") }),
      manifest: makeManifest(),
      lifecycleState: "ready" as const,
      supportedModalities: ["text" as const],
      supportedFeatures: ["streaming"],
    };
    const result = unwrap(validator.validateAdapter(descriptor));
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "adapter_provider_mismatch")).toBe(true);
  });

  it("builds manifests with a parseable version", () => {
    const manifest = new ProviderManifestBuilder()
      .withProviderId(asProviderId("p"))
      .withVendor("v")
      .withVersion("2.3.4")
      .withModels([new ProviderModelBuilder().withId("m").asDefault().build()])
      .build();
    expect(manifest.version.raw).toBe("2.3.4");
    expect(parseManifestVersion("2.3.4")?.major).toBe(2);
    expect(parseManifestVersion("nope")).toBeUndefined();
  });
});
