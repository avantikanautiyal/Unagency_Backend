import {
  sampleCapabilityProfile,
  sampleExecutionRequest,
  setupOpenAIProvider,
} from "../../../../../src/platform/intelligence/providers/openai/testing";
import { NO_RETRY_POLICY } from "../../../../../src/platform/intelligence/providers/runtime/contracts/retry-policy";

describe("OpenAI Provider (reference implementation)", () => {
  it("discovers models dynamically and caches them", async () => {
    const platform = await setupOpenAIProvider();
    const first = await platform.discoverModels(true);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.models.length).toBeGreaterThan(0);
    expect(first.value.cacheHit).toBe(false);

    const second = await platform.discoverModels();
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.cacheHit).toBe(true);
  });

  it("resolves best model from capability profile without hardcoded gpt-4/gpt-5", async () => {
    const platform = await setupOpenAIProvider();
    const resolved = platform.resolveModel(sampleCapabilityProfile());
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    expect(resolved.value.selectedModelId).toBeTruthy();
    expect(resolved.value.selectedModelId).not.toMatch(/^gpt-5$/);
    expect(resolved.value.rationale).toContain("Selected");
    // Callers never asked for a specific model name
    expect(sampleCapabilityProfile()).not.toHaveProperty("modelId");
  });

  it("executes through adapter → SDK → dispatcher and produces artifacts", async () => {
    const platform = await setupOpenAIProvider();
    const token = { isCancelled: false, reason: undefined };
    const result = await platform.dispatcher.dispatch(sampleExecutionRequest(), token as never);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.output.content).toBeTruthy();
    expect(result.value.providerId).toBe("openai");

    const artifacts = platform.dispatcher.getLastArtifacts();
    expect(artifacts?.executionArtifact).toBeDefined();
    expect(artifacts?.experienceCandidate).toBeDefined();
    expect(artifacts?.providerMetrics.modelId).toBeTruthy();
    expect(artifacts?.providerMetrics.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("runs certification before ACTIVE status", async () => {
    const platform = await setupOpenAIProvider();
    expect(platform.certification).toBeDefined();
    expect(["active", "experimental"]).toContain(platform.getStatus());
    if (platform.certification) {
      expect(platform.certification.scorecard).toBeDefined();
      expect(platform.certification.badge).toBeDefined();
    }
    if (
      platform.certification?.status === "certified" ||
      platform.certification?.status === "certified_with_warnings"
    ) {
      expect(platform.getStatus()).toBe("active");
    } else {
      expect(platform.getStatus()).toBe("experimental");
    }
  });

  it("never requires callers to specify gpt-4 or gpt-5 in execution request", async () => {
    const platform = await setupOpenAIProvider();
    const request = sampleExecutionRequest({ modelId: undefined });
    expect(request.modelId).toBeUndefined();

    const token = { isCancelled: false };
    const result = await platform.dispatcher.dispatch(request, token as never);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const artifacts = platform.dispatcher.getLastArtifacts();
    expect(artifacts?.modelMetrics.modelId).toBeTruthy();
    expect(String(artifacts?.modelMetrics.modelId)).not.toBe("gpt-4");
    expect(String(artifacts?.modelMetrics.modelId)).not.toBe("gpt-5");
  });

  it("builds manifest from discovered inventory only", async () => {
    const platform = await setupOpenAIProvider();
    expect(platform.manifest.vendor).toBe("openai");
    expect(platform.manifest.models.length).toBeGreaterThan(0);
    expect(platform.manifest.authenticationTypes).toContain("api_key");
  });

  it("supports embeddings profile via resolver", async () => {
    const platform = await setupOpenAIProvider();
    const resolved = platform.resolveModel(
      sampleCapabilityProfile({
        modality: "embedding",
        requireEmbeddings: true,
        requireToolCalling: false,
        requireStructuredOutputs: false,
      })
    );
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value.selectedModelId).toMatch(/embedding/);
  });

  it("wires runtime with OpenAI dispatcher", async () => {
    const platform = await setupOpenAIProvider();
    const request = sampleExecutionRequest();
    const result = await platform.runtime.execute(request);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.success).toBe(true);
    void NO_RETRY_POLICY;
  });
});
