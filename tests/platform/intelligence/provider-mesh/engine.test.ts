import {
  sampleMeshRequest,
  setupProviderMeshPlatform,
  makeObservabilityEvent,
} from "../../../../src/platform/intelligence/provider-mesh/testing";
import { ProviderMeshRequestBuilder } from "../../../../src/platform/intelligence/provider-mesh/builders/mesh-request-builder";

describe("Provider Mesh Platform", () => {
  it("produces a complete mesh snapshot for multiple providers", async () => {
    const { engine } = setupProviderMeshPlatform();
    const result = await engine.observe(sampleMeshRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const snap = result.value.snapshot;
    expect(snap.providers.length).toBeGreaterThanOrEqual(4);
    expect(snap.routingHints.length).toBeGreaterThan(0);
    expect(snap.failoverChains.length).toBeGreaterThan(0);
    expect(snap.capacityReports.length).toBe(snap.providers.length);
    expect(snap.version).toBeTruthy();

    for (const p of snap.providers) {
      expect(p.state).toBeTruthy();
      expect(p.compositeScore.overall).toBeGreaterThanOrEqual(0);
      expect(p.compositeScore.overall).toBeLessThanOrEqual(1);
      expect(p.explanation).toBeTruthy();
    }

    for (const h of snap.routingHints.slice(0, 5)) {
      expect(h.rationale.why).toBeTruthy();
      expect(h.rationale.confidence).toBeGreaterThan(0);
      expect(h.rationale.metrics.length).toBeGreaterThan(0);
      expect(h.rationale.evidence.length).toBeGreaterThan(0);
    }

    expect(snap.failoverChains[0]?.rationale.why).toBeTruthy();
  });

  it("classifies degraded providers by error/utilization signals", async () => {
    const { engine } = setupProviderMeshPlatform();
    const result = await engine.observe(sampleMeshRequest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const degraded = result.value.snapshot.providers.find(
      (p) => p.providerId === "degraded-provider"
    );
    expect(degraded).toBeDefined();
    expect(["degraded", "busy", "rate_limited", "unavailable"]).toContain(degraded!.state);
  });

  it("prefers high-scoring healthy providers in routing hints", async () => {
    const { engine } = setupProviderMeshPlatform();
    const result = await engine.observe(sampleMeshRequest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const preferHints = result.value.snapshot.routingHints.filter((h) => h.action === "prefer");
    expect(preferHints.length).toBeGreaterThan(0);
    expect(preferHints.some((h) => h.providerId === "anthropic" || h.providerId === "openai")).toBe(
      true
    );
  });

  it("orders failover fallbacks by composite score", async () => {
    const { engine } = setupProviderMeshPlatform();
    const result = await engine.observe(sampleMeshRequest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const chain = result.value.snapshot.failoverChains.find(
      (c) => c.primaryProviderId === "anthropic" || c.primaryProviderId === "openai"
    );
    expect(chain).toBeDefined();
    expect(chain!.orderedFallbacks.length).toBeGreaterThan(0);
    expect(chain!.rationale.confidence).toBeGreaterThan(0);
  });

  it("emits canary plans for experimental providers", async () => {
    const { engine } = setupProviderMeshPlatform();
    const result = await engine.observe(sampleMeshRequest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const canaries = result.value.snapshot.canaryPlans;
    expect(canaries.some((c) => c.targetProviderId === "experimental-model")).toBe(true);
    expect(canaries.every((c) => c.rationale.why.length > 0)).toBe(true);
  });

  it("produces shadow recommendations without executing providers", async () => {
    const { engine } = setupProviderMeshPlatform();
    const result = await engine.observe(sampleMeshRequest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const shadows = result.value.snapshot.shadowRecommendations;
    expect(shadows.length).toBeGreaterThan(0);
    expect(shadows.every((s) => s.comparisonMetadata.execution === false)).toBe(true);
  });

  it("rejects empty event lists", async () => {
    const { engine } = setupProviderMeshPlatform();
    const result = await engine.observe(
      ProviderMeshRequestBuilder.create().withRequestId("x").withEvents([]).build()
    );
    expect(result.ok).toBe(false);
  });

  it("exposes snapshot after observe without networking", async () => {
    const { engine } = setupProviderMeshPlatform();
    await engine.observe(sampleMeshRequest());
    const snap = await engine.snapshot();
    expect(snap.ok).toBe(true);
    if (!snap.ok) return;
    expect(snap.value.providers.length).toBeGreaterThan(0);
  });

  it("marks maintenance providers accordingly", async () => {
    const { engine } = setupProviderMeshPlatform();
    const result = await engine.observe(
      ProviderMeshRequestBuilder.create()
        .withRequestId("maint")
        .withEvents([
          makeObservabilityEvent("maint-provider", {
            eventId: "m1",
            maintenance: true,
            errorRate: 0,
            successRate: 1,
          }),
        ])
        .build()
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.snapshot.providers[0]?.state).toBe("maintenance");
  });
});
