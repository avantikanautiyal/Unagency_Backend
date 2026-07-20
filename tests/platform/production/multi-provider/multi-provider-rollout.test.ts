import {
  setupMultiProviderRollout,
} from "../../../../src/platform/production/multi-provider/testing";
import { MultiProviderRolloutRequestBuilder } from "../../../../src/platform/production/multi-provider/builders/multi-provider-rollout-request-builder";
import {
  listCatalogProviderIds,
  countCatalogModels,
} from "../../../../src/platform/intelligence/provider-catalog/catalog/provider-catalog-seed";
import { simulateProviderMetrics } from "../../../../src/platform/production/multi-provider/evidence/build-evidence";

describe("Multi-Provider Production Rollout", () => {
  it("integrates every catalog provider exclusively via Universal Provider Generator", async () => {
    const { engine } = setupMultiProviderRollout();
    const result = await engine.rollout({ requestId: "mp_full_1" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.value;
    expect(report.allViaGenerator).toBe(true);
    expect(report.skippedInventedProviders).toBe(0);
    expect(report.providerCount).toBe(listCatalogProviderIds().length);
    expect(report.modelCount).toBe(countCatalogModels());
    expect(report.activeCount).toBe(report.providerCount);
    expect(report.generationFileCount).toBeGreaterThan(report.providerCount * 10);
    expect(report.certifications.every((c) => c.certified)).toBe(true);
    expect(report.runtimeRegistrations).toHaveLength(report.providerCount);
    expect(
      report.runtimeRegistrations.every(
        (r) =>
          r.runtime &&
          r.mesh &&
          r.routing &&
          r.negotiation &&
          r.secretCompatible &&
          r.distributedExecutionCompatible &&
          r.observabilityCompatible
      )
    ).toBe(true);

    const openai = report.runtimeRegistrations.find((r) => r.providerId === "openai");
    expect(openai?.usedExistingOpenAILeaf).toBe(true);
  });

  it("maps capabilities across multiple providers for routing/consensus/eval", async () => {
    const { engine } = setupMultiProviderRollout();
    const result = await engine.rollout(
      MultiProviderRolloutRequestBuilder.create()
        .withRequestId("mp_cap")
        .build()
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { successCriteria, multiProviderCapabilityCount, comparisons } = result.value;
    expect(multiProviderCapabilityCount).toBeGreaterThan(0);
    expect(successCriteria.sameCapabilityAcrossProviders).toBe(true);
    expect(successCriteria.routingCanChoose).toBe(true);
    expect(successCriteria.consensusCanCombine).toBe(true);
    expect(successCriteria.evaluationCanCompare).toBe(true);
    expect(successCriteria.learningCanCompare).toBe(true);
    expect(successCriteria.evidenceDrivenRecommendationsReady).toBe(true);
    expect(comparisons.some((c) => c.providers.length >= 2)).toBe(true);
  });

  it("publishes complete benchmark evidence fields", async () => {
    const { engine, evidenceStore } = setupMultiProviderRollout();
    const result = await engine.rollout({
      requestId: "mp_bench",
      providerIds: ["anthropic", "google", "mistral"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.evidence.length).toBeGreaterThan(0);
    for (const e of result.value.evidence) {
      expect(e.capabilityId).toBeTruthy();
      expect(e.providerId).toBeTruthy();
      expect(e.modelId).toBeTruthy();
      expect(e.latencyMs).toBeGreaterThan(0);
      expect(e.totalTokens).toBe(e.promptTokens + e.completionTokens);
      expect(typeof e.cost).toBe("number");
      expect(typeof e.evaluationScore).toBe("number");
      expect(typeof e.humanReviewRequired).toBe("boolean");
      expect(typeof e.success).toBe("boolean");
      expect(typeof e.retryCount).toBe("number");
      expect(typeof e.streamingChunkCount).toBe("number");
    }
    expect(evidenceStore.list().length).toBe(result.value.evidence.length);
  });

  it("publishes evidence into observability additively", async () => {
    const { engine, observability } = setupMultiProviderRollout();
    const result = await engine.rollout({
      requestId: "mp_obs",
      providerIds: ["deepseek", "xai"],
      publishObservability: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const costs = observability.engine.costSummary({});
    expect(costs.ok).toBe(true);
    if (costs.ok) {
      expect(costs.value.records).toBeGreaterThan(0);
    }
    const tokens = observability.engine.tokenSummary({});
    expect(tokens.ok).toBe(true);
    if (tokens.ok) {
      expect(tokens.value.totalTokens).toBeGreaterThan(0);
    }
  });

  it("discovers models and resolves by capability not brand", async () => {
    const { engine, catalog } = setupMultiProviderRollout();
    const result = await engine.rollout({
      requestId: "mp_disc",
      providerIds: ["anthropic"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.discoveries[0]?.ok).toBe(true);
    expect(result.value.modelInventory.length).toBeGreaterThan(0);

    const caps = catalog.capabilityRegistry.list();
    expect(caps.ok).toBe(true);
  });

  it("reports compatibility with secrets, execution, mesh, production validation", async () => {
    const { engine } = setupMultiProviderRollout({
      productionValidationAttached: true,
    });
    const result = await engine.rollout({
      requestId: "mp_compat",
      providerIds: ["openai", "elevenlabs", "runway", "exa"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const c = result.value.compatibility;
    expect(c.secrets).toBe(true);
    expect(c.distributedExecution).toBe(true);
    expect(c.observability).toBe(true);
    expect(c.providerMesh).toBe(true);
    expect(c.productionValidation).toBe(true);
  });

  it("does not invent providers outside the official catalog", async () => {
    const { engine } = setupMultiProviderRollout();
    const result = await engine.rollout({
      requestId: "mp_invent",
      providerIds: ["acme-fake"],
    });
    expect(result.ok).toBe(false);
  });

  it("simulates stable metrics for the same provider/model pair", () => {
    const a = simulateProviderMetrics("anthropic", "anthropic:claude-opus-4-1");
    const b = simulateProviderMetrics("anthropic", "anthropic:claude-opus-4-1");
    expect(a).toEqual(b);
  });
});
