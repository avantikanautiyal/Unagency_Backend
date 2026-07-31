/**
 * M9.5Q — Cost Intelligence offline certification.
 * EXTERNAL AI CALLS: 0. Synthetic TEST_PRICE_* fixtures only — not vendor prices.
 */

import * as fs from "fs";
import * as path from "path";
import {
  CostCalculator,
  InMemoryProviderPricingCatalogue,
  seedTestPricingFixtures,
  aggregateAttemptCosts,
  normalizeUsage,
  usageHasInvalidNumbers,
  queryTenantSpend,
  evaluateCostBudgetGuard,
  isCostRoutingEligible,
  type CanonicalCostRecord,
} from "../../../../src/platform/intelligence/cost";
import { InMemoryModelPerformanceStore } from "../../../../src/platform/intelligence/providers/routing/performance/stores/in-memory-model-performance-store";
import { ModelPerformanceIntelligence } from "../../../../src/platform/intelligence/providers/routing/performance/intelligence/model-performance-intelligence";
import { loadAdaptiveRoutingConfig } from "../../../../src/platform/intelligence/providers/routing/performance/config/adaptive-routing-config";
import { aggregatePerformanceEvidence } from "../../../../src/platform/intelligence/providers/routing/performance/aggregation/performance-aggregator";
import { PerformanceEvidenceWriter } from "../../../../src/platform/intelligence/providers/routing/performance/feedback/performance-evidence-writer";
import type { PerformanceEvidence } from "../../../../src/platform/intelligence/providers/routing/performance/contracts/performance-evidence";
import { buildExecutionIntelligenceSnapshot } from "../../../../src/platform/api/execution-intelligence/projection/build-snapshot";
import { integrityForPlaceholderJudges } from "../../../../src/platform/intelligence/evaluation/integrity";

function catalogueWithFixtures(): InMemoryProviderPricingCatalogue {
  const c = new InMemoryProviderPricingCatalogue();
  seedTestPricingFixtures(c);
  return c;
}

describe("M9.5Q cost intelligence", () => {
  const catalogue = catalogueWithFixtures();
  const calc = new CostCalculator(catalogue);

  it("A: verified token pricing calculation", () => {
    const r = calc.calculate({
      providerId: "provider.test_a",
      modelId: "model-a",
      capabilityId: "text.generate",
      usage: { promptTokens: 1000, completionTokens: 500 },
      atIso: "2024-01-01T00:00:00.000Z",
    });
    expect(r.status).toBe("calculated");
    expect(r.amount).toBeCloseTo(0.001 + 0.001, 8); // 1000*0.001/1000 + 500*0.002/1000
    expect(r.routingEligible).toBe(true);
    expect(r.pricingVersion).toBe("TEST_PRICE_V1");
    expect(r.currency).toBe("USD");
  });

  it("B: unknown pricing → amount null, routingEligible false", () => {
    const r = calc.calculate({
      providerId: "provider.unknown",
      modelId: "model-x",
      capabilityId: "text.generate",
      usage: { promptTokens: 100, completionTokens: 50 },
    });
    expect(r.amount).toBeNull();
    expect(r.routingEligible).toBe(false);
    expect(r.status).toBe("unknown");
  });

  it("C: missing usage → cost unknown", () => {
    const r = calc.calculate({
      providerId: "provider.test_a",
      modelId: "model-a",
      capabilityId: "text.generate",
      usage: null,
      atIso: "2024-01-01T00:00:00.000Z",
    });
    expect(r.amount).toBeNull();
    expect(r.exclusionReason).toBe("missing_usage");
  });

  it("D: partial usage cannot masquerade as total", () => {
    const r = calc.calculate({
      providerId: "provider.test_a",
      modelId: "model-a",
      capabilityId: "text.generate",
      usage: { promptTokens: 1000 }, // missing output
      atIso: "2024-01-01T00:00:00.000Z",
    });
    expect(r.status).toBe("partially_calculated");
    expect(r.amount).toBeNull();
    expect(r.routingEligible).toBe(false);
    expect(r.components.length).toBe(1);
  });

  it("E: historical pricing version survives catalogue update", () => {
    const a = calc.calculate({
      providerId: "provider.test_a",
      modelId: "model-a",
      capabilityId: "text.generate",
      usage: { promptTokens: 1000, completionTokens: 0 },
      atIso: "2024-01-01T00:00:00.000Z",
    });
    const b = calc.calculate({
      providerId: "provider.test_a",
      modelId: "model-a",
      capabilityId: "text.generate",
      usage: { promptTokens: 1000, completionTokens: 0 },
      atIso: "2025-07-01T00:00:00.000Z",
    });
    expect(a.pricingVersion).toBe("TEST_PRICE_V1");
    expect(b.pricingVersion).toBe("TEST_PRICE_V2");
    expect(a.amount).not.toEqual(b.amount);
    expect(a.amount).toBeCloseTo(0.001, 8);
    expect(b.amount).toBeCloseTo(0.01, 8);
  });

  it("F: input/output token components", () => {
    const r = calc.calculate({
      providerId: "provider.test_a",
      modelId: "model-a",
      capabilityId: "text.generate",
      usage: { promptTokens: 2000, completionTokens: 1000 },
      atIso: "2024-01-01T00:00:00.000Z",
    });
    expect(r.components.map((c) => c.dimension).sort()).toEqual([
      "input_tokens",
      "output_tokens",
    ]);
  });

  it("G: embedding pricing", () => {
    const r = calc.calculate({
      providerId: "provider.test_embed",
      modelId: "embed-a",
      capabilityId: "embedding.generate",
      usage: { promptTokens: 10_000 },
    });
    expect(r.amount).toBeCloseTo(0.001, 8);
    expect(r.routingEligible).toBe(true);
  });

  it("H: TTS character pricing fixture", () => {
    const r = calc.calculate({
      providerId: "provider.test_tts",
      modelId: "tts-a",
      capabilityId: "audio.synthesize",
      usage: { characters: 1000 },
    });
    expect(r.amount).toBeCloseTo(0.015, 8);
  });

  it("I: video duration pricing fixture", () => {
    const r = calc.calculate({
      providerId: "provider.test_video",
      modelId: "video-a",
      capabilityId: "video.generate",
      usage: { videoSeconds: 10 },
    });
    expect(r.amount).toBeCloseTo(0.5, 8);
  });

  it("J: multi-attempt failover aggregates known costs", () => {
    const a = calc.calculate({
      providerId: "provider.test_a",
      modelId: "model-a",
      capabilityId: "text.generate",
      usage: { promptTokens: 1000, completionTokens: 0 },
      atIso: "2024-01-01T00:00:00.000Z",
    });
    const b = calc.calculate({
      providerId: "provider.test_a",
      modelId: "model-a",
      capabilityId: "text.generate",
      usage: { promptTokens: 1000, completionTokens: 0 },
      atIso: "2024-01-01T00:00:00.000Z",
    });
    const agg = aggregateAttemptCosts([a, b]);
    expect(agg.totalAmount).toBeCloseTo(0.002, 8);
    expect(agg.knownAttemptCount).toBe(2);
    expect(agg.unknownAttemptCount).toBe(0);
  });

  it("K: failed attempt with billable usage retained; mixed unknown → total null", () => {
    const known = calc.calculate({
      providerId: "provider.test_a",
      modelId: "model-a",
      capabilityId: "text.generate",
      usage: { promptTokens: 1000, completionTokens: 0 },
      atIso: "2024-01-01T00:00:00.000Z",
    });
    const unknown: CanonicalCostRecord = {
      ...known,
      status: "unknown",
      amount: null,
      routingEligible: false,
      method: "none",
      trust: "none",
      exclusionReason: "pricing_unavailable",
      providerId: "provider.other",
    };
    const agg = aggregateAttemptCosts([known, unknown]);
    expect(agg.knownAmount).toBeCloseTo(0.001, 8);
    expect(agg.totalAmount).toBeNull();
    expect(agg.unknownAttemptCount).toBe(1);
  });

  it("L: duplicate attemptId does not double-count", async () => {
    const store = new InMemoryModelPerformanceStore();
    const writer = new PerformanceEvidenceWriter(store, undefined, calc);
    const attempt = {
      attemptId: "at_dup",
      providerId: "provider.test_a",
      modelId: "model-a",
      positionInRoute: 0,
      primaryOrFailover: "primary" as const,
      startedAt: "2024-01-01T00:00:00.000Z",
      completedAt: "2024-01-01T00:00:01.000Z",
      latencyMs: 100,
      success: true,
      failureCategory: "none" as const,
    };
    const result = {
      success: true,
      status: "succeeded" as const,
      response: {
        usage: { promptTokens: 1000, completionTokens: 0 },
      },
      statistics: { attempts: 1 },
    };
    const ctx = {
      executionId: "ex1",
      organizationId: "org1",
      capabilityId: "text.generate",
      createId: (p: string) => `${p}_1`,
      nowIso: () => "2024-01-01T00:00:01.000Z",
      costRecord: calc.calculate({
        providerId: "provider.test_a",
        modelId: "model-a",
        capabilityId: "text.generate",
        usage: { promptTokens: 1000, completionTokens: 0 },
        atIso: "2024-01-01T00:00:00.000Z",
      }),
    };
    await writer.recordAttempt(attempt as never, result as never, ctx);
    await writer.recordAttempt(attempt as never, result as never, {
      ...ctx,
      createId: (p: string) => `${p}_2`,
    });
    const rows = await store.query({ organizationId: "org1", limit: 10 });
    expect(rows).toHaveLength(1);
  });

  it("M/N: restart + multi-instance idempotency via attemptId", async () => {
    const store = new InMemoryModelPerformanceStore();
    const e: PerformanceEvidence = {
      evidenceId: "ev1",
      executionId: "ex",
      attemptId: "at_stable",
      organizationId: "org",
      capabilityId: "text.generate",
      providerId: "provider.test_a",
      modelId: "model-a",
      positionInRoute: 0,
      primaryOrFailover: "primary",
      startedAt: "2024-01-01T00:00:00.000Z",
      completedAt: "2024-01-01T00:00:01.000Z",
      latencyMs: 10,
      success: true,
      failureCategory: "none",
      estimatedCost: 0.001,
      costEligible: true,
      costCurrency: "USD",
      pricingVersion: "TEST_PRICE_V1",
      retryCount: 0,
      timeoutOccurred: false,
      rateLimited: false,
      recordedAt: "2024-01-01T00:00:01.000Z",
    };
    expect(await store.recordIdempotent(e)).toBe("inserted");
    expect(await store.recordIdempotent({ ...e, evidenceId: "ev2" })).toBe(
      "duplicate"
    );
  });

  it("O: async completion cost via calculator (post-completion)", () => {
    const r = calc.calculate({
      providerId: "provider.test_video",
      modelId: "video-a",
      capabilityId: "video.generate",
      usage: { videoSeconds: 5 },
    });
    expect(r.status).toBe("calculated");
    expect(r.amount).toBeCloseTo(0.25, 8);
  });

  it("P: tool multi-round usage aggregation before cost", () => {
    const round1 = normalizeUsage({ promptTokens: 100, completionTokens: 50 })!;
    const round2 = normalizeUsage({ promptTokens: 80, completionTokens: 40 })!;
    const aggregated = {
      promptTokens: (round1.promptTokens ?? 0) + (round2.promptTokens ?? 0),
      completionTokens:
        (round1.completionTokens ?? 0) + (round2.completionTokens ?? 0),
    };
    const r = calc.calculate({
      providerId: "provider.test_a",
      modelId: "model-a",
      capabilityId: "text.generate",
      usage: aggregated,
      atIso: "2024-01-01T00:00:00.000Z",
    });
    expect(r.amount).toBeCloseTo(180 / 1000 * 0.001 + 90 / 1000 * 0.002, 8);
  });

  it("Q: tenant isolation for spend query", async () => {
    const store = new InMemoryModelPerformanceStore();
    await store.recordIdempotent({
      evidenceId: "e1",
      executionId: "x1",
      attemptId: "a1",
      organizationId: "tenant_a",
      capabilityId: "text.generate",
      providerId: "p",
      modelId: "m",
      positionInRoute: 0,
      primaryOrFailover: "primary",
      startedAt: "t",
      completedAt: "t",
      latencyMs: 1,
      success: true,
      failureCategory: "none",
      estimatedCost: 1,
      costEligible: true,
      costCurrency: "USD",
      retryCount: 0,
      timeoutOccurred: false,
      rateLimited: false,
      recordedAt: "t",
    });
    await store.recordIdempotent({
      evidenceId: "e2",
      executionId: "x2",
      attemptId: "a2",
      organizationId: "tenant_b",
      capabilityId: "text.generate",
      providerId: "p",
      modelId: "m",
      positionInRoute: 0,
      primaryOrFailover: "primary",
      startedAt: "t",
      completedAt: "t",
      latencyMs: 1,
      success: true,
      failureCategory: "none",
      estimatedCost: 99,
      costEligible: true,
      costCurrency: "USD",
      retryCount: 0,
      timeoutOccurred: false,
      rateLimited: false,
      recordedAt: "t",
    });
    const a = await queryTenantSpend(store, { organizationId: "tenant_a" });
    expect(a.knownSpend).toBe(1);
    expect(a.knownSpend).not.toBe(100);
    await expect(
      queryTenantSpend(store, { organizationId: "" })
    ).rejects.toThrow(/organizationId/);
  });

  it("R: cross-currency candidates not compared", () => {
    const usd = calc.calculate({
      providerId: "provider.test_a",
      modelId: "model-a",
      capabilityId: "text.generate",
      usage: { promptTokens: 1000, completionTokens: 0 },
      atIso: "2024-01-01T00:00:00.000Z",
    });
    const eur = calc.calculate({
      providerId: "provider.test_eur",
      modelId: "model-eur",
      capabilityId: "text.generate",
      usage: { promptTokens: 1000, completionTokens: 0 },
    });
    const agg = aggregateAttemptCosts([usd, eur]);
    expect(agg.totalAmount).toBeNull();
    expect(agg.currency).toBeNull();
    expect(agg.routingEligible).toBe(false);
  });

  it("S: lowest_cost eligible evidence feeds averageCost", () => {
    const now = Date.now();
    const rows: PerformanceEvidence[] = Array.from({ length: 25 }, (_, i) => ({
      evidenceId: `e${i}`,
      executionId: `x${i}`,
      attemptId: `a${i}`,
      organizationId: "org",
      capabilityId: "text.generate",
      providerId: "provider.test_a",
      modelId: "model-a",
      positionInRoute: 0,
      primaryOrFailover: "primary" as const,
      startedAt: new Date(now - 1000).toISOString(),
      completedAt: new Date(now - 1000).toISOString(),
      latencyMs: 50,
      success: true,
      failureCategory: "none" as const,
      estimatedCost: 0.01,
      costEligible: true,
      costCurrency: "USD",
      retryCount: 0,
      timeoutOccurred: false,
      rateLimited: false,
      recordedAt: new Date(now - 1000).toISOString(),
    }));
    const m = aggregatePerformanceEvidence(
      rows,
      { providerId: "provider.test_a", modelId: "model-a", capabilityId: "text.generate" },
      { windowDays: 30, nowMs: () => now }
    );
    expect(m?.averageCost).toBeCloseTo(0.01, 8);
    expect(m?.costSampleCount).toBe(25);
  });

  it("T: cold start unknown cost → averageCost null", () => {
    const m = aggregatePerformanceEvidence(
      [],
      { providerId: "p", modelId: "m" },
      { windowDays: 30 }
    );
    expect(m).toBeUndefined();
  });

  it("U/V: non-eligible cost ignored; sample threshold via intelligence", async () => {
    const store = new InMemoryModelPerformanceStore();
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      await store.recordIdempotent({
        evidenceId: `e${i}`,
        executionId: `x${i}`,
        attemptId: `a${i}`,
        organizationId: "org",
        capabilityId: "text.generate",
        providerId: "p",
        modelId: "m",
        positionInRoute: 0,
        primaryOrFailover: "primary",
        startedAt: new Date(now).toISOString(),
        completedAt: new Date(now).toISOString(),
        latencyMs: 10,
        success: true,
        failureCategory: "none",
        estimatedCost: 0.01,
        costEligible: false,
        costCurrency: "USD",
        retryCount: 0,
        timeoutOccurred: false,
        rateLimited: false,
        recordedAt: new Date(now).toISOString(),
      });
    }
    const rows = await store.query({ organizationId: "org", limit: 100 });
    const metrics = aggregatePerformanceEvidence(
      rows,
      { providerId: "p", modelId: "m", organizationId: "org" },
      { windowDays: 30, nowMs: () => now }
    );
    expect(metrics?.averageCost).toBeNull();
    expect(metrics?.unknownCostSampleCount).toBe(5);

    const intel = new ModelPerformanceIntelligence(
      store,
      loadAdaptiveRoutingConfig({
        ADAPTIVE_ROUTING_ENABLED: "true",
        ADAPTIVE_ROUTING_MIN_SAMPLES: "20",
      })
    );
    const blend = await intel.blendScore({
      key: {
        providerId: "p",
        modelId: "m",
        capabilityId: "text.generate",
        organizationId: "org",
      },
      staticTotal: 0.7,
      staticQuality: 0.7,
      staticLatency: 0.7,
      staticCost: 0.5,
      staticHealth: 1,
      strategy: "lowest_cost",
    });
    expect(blend.explain.coldStart).toBe(true);
  });

  it("W: pricing mismatch model → unknown", () => {
    const r = calc.calculate({
      providerId: "provider.test_a",
      modelId: "wrong-model",
      capabilityId: "text.generate",
      usage: { promptTokens: 10, completionTokens: 10 },
      atIso: "2024-01-01T00:00:00.000Z",
    });
    expect(r.amount).toBeNull();
  });

  it("X: malformed/negative usage rejected", () => {
    expect(usageHasInvalidNumbers({ promptTokens: -1 })).toBe(true);
    expect(usageHasInvalidNumbers({ promptTokens: Number.NaN })).toBe(true);
    const r = calc.calculate({
      providerId: "provider.test_a",
      modelId: "model-a",
      capabilityId: "text.generate",
      usage: { promptTokens: -5, completionTokens: 1 },
      atIso: "2024-01-01T00:00:00.000Z",
    });
    expect(r.amount).toBeNull();
    expect(r.exclusionReason).toBe("invalid_usage_numbers");
  });

  it("Y: client-supplied fake cost ignored (no providerReported)", () => {
    const r = calc.calculate({
      providerId: "provider.test_a",
      modelId: "model-a",
      capabilityId: "text.generate",
      usage: {
        promptTokens: 1000,
        completionTokens: 0,
        clientCost: 999,
        spoofedCost: 999,
        cost: 999,
      },
      atIso: "2024-01-01T00:00:00.000Z",
      rejectClientCostFields: true,
      providerReported: null,
    });
    expect(r.amount).toBeCloseTo(0.001, 8);
    expect(r.amount).not.toBe(999);
  });

  it("Z: diagnostics / EI snapshot never turn unknown into zero", () => {
    const snap = buildExecutionIntelligenceSnapshot({
      execution: {
        executionId: "ex",
        organizationId: "org",
        status: "succeeded",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:01.000Z",
        completedAt: "2024-01-01T00:00:01.000Z",
        cost: undefined,
        evaluationScore: null,
      } as never,
      metadata: {},
      nowIso: () => "2024-01-01T00:00:01.000Z",
    });
    expect(snap.costs.totalCost).toBeNull();
    expect(snap.costs.costStatus).toBe("unknown");
    expect(snap.costs.totalCost).not.toBe(0);
  });

  it("AA: adaptive routing works when cost unavailable (static cost)", async () => {
    const store = new InMemoryModelPerformanceStore();
    const intel = new ModelPerformanceIntelligence(
      store,
      loadAdaptiveRoutingConfig({
        ADAPTIVE_ROUTING_ENABLED: "true",
        ADAPTIVE_ROUTING_MIN_SAMPLES: "20",
      })
    );
    const blend = await intel.blendScore({
      key: {
        providerId: "p",
        modelId: "m",
        capabilityId: "text.generate",
      },
      staticTotal: 0.8,
      staticQuality: 0.8,
      staticLatency: 0.7,
      staticCost: 0.6,
      staticHealth: 1,
      strategy: "balanced",
    });
    expect(blend.explain.coldStart).toBe(true);
    expect(blend.total).toBeGreaterThan(0);
  });

  it("AB: M9.5P quality eligibility unchanged", () => {
    const integrity = integrityForPlaceholderJudges({ overallScore: 0.99 });
    expect(integrity.qualityScore).toBeNull();
    expect(integrity.feedbackEligible).toBe(false);
  });

  it("AD: credential-free catalogue empty still ready", () => {
    const empty = new InMemoryProviderPricingCatalogue();
    expect(empty.count()).toBe(0);
    const r = new CostCalculator(empty).calculate({
      providerId: "openai",
      modelId: "gpt-4o",
      capabilityId: "text.generate",
      usage: { promptTokens: 10, completionTokens: 10 },
    });
    expect(r.amount).toBeNull();
    expect(isCostRoutingEligible(r)).toBe(false);
  });

  it("budget guard seams observe/enforce", () => {
    expect(
      evaluateCostBudgetGuard({
        mode: "observe",
        knownSpend: 100,
        budgetLimit: 10,
        upcomingCostKnown: true,
      }).allowed
    ).toBe(true);
    expect(
      evaluateCostBudgetGuard({
        mode: "enforce_known_cost",
        knownSpend: 100,
        budgetLimit: 10,
        upcomingCostKnown: true,
      }).allowed
    ).toBe(false);
    expect(
      evaluateCostBudgetGuard({
        mode: "enforce_known_cost",
        knownSpend: 100,
        budgetLimit: 10,
        upcomingCostKnown: false,
      }).reason
    ).toBe("unknown_cost_not_rejected_by_default");
  });
});

describe("M9.5Q provider bypass — cost paths", () => {
  it("cost module has no direct provider SDK imports", () => {
    const root = path.resolve(__dirname, "../../../../src/platform/intelligence/cost");
    const files: string[] = [];
    const walk = (d: string) => {
      for (const name of fs.readdirSync(d)) {
        const p = path.join(d, name);
        if (fs.statSync(p).isDirectory()) walk(p);
        else if (p.endsWith(".ts")) files.push(p);
      }
    };
    walk(root);
    const forbidden = [/from ["']openai["']/, /from ["']@anthropic/, /api\.openai\.com/];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      for (const re of forbidden) {
        expect(re.test(src)).toBe(false);
      }
    }
  });
});
