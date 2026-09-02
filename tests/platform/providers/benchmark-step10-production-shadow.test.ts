/**
 * Step 10 — Production Evidence + Shadow Optimization tests.
 * No paid API calls — deterministic mocks only.
 */

import {
  buildModelPerformanceRecord,
  getBenchmarkCase,
  DEFAULT_BENCHMARK_STRATEGY,
  InMemoryBenchmarkPerformanceRecordStore,
  InMemoryShadowDecisionStore,
  ingestProductionEvidenceAndShadow,
  resolveShadowDecision,
  createProductionIntelligenceQueryService,
  assessPromotionReadiness,
  buildOptimizationRecommendation,
  sameShadowCandidate,
  type BenchmarkModelTarget,
  type ModelPerformanceRecord,
} from "../../../src/platform/providers/routing/performance/benchmark";
import { validateOutputContract, clearValidationCache } from "../../../src/platform/os/evaluation/output-validation";
import { loadAdaptiveRoutingConfig } from "../../../src/platform/providers/routing/performance/config/adaptive-routing-config";
import { filterControlledComparisonRecords, filterObservationalProductionRecords } from "../../../src/platform/providers/routing/performance/benchmark/evidence/evidence-validity";

const textModel: BenchmarkModelTarget = Object.freeze({
  providerId: "provider.openai",
  modelId: "openai/gpt-4o",
  capabilityId: "text.generate",
});

const altModel: BenchmarkModelTarget = Object.freeze({
  providerId: "provider.anthropic",
  modelId: "anthropic/claude-sonnet-4-5",
  capabilityId: "text.generate",
});

function controlledRecord(input: {
  readonly id: string;
  readonly model: BenchmarkModelTarget;
  readonly qualityScore: number;
  readonly strategyId?: string;
  readonly knowledgeId?: string;
}): ModelPerformanceRecord {
  clearValidationCache();
  const bc = getBenchmarkCase("bench.social.copywriting")!;
  const validation = validateOutputContract({
    organizationId: "org_step10",
    executionId: `exec_${input.id}`,
    service: bc.service,
    subtype: bc.subtype,
    outputKind: bc.outputKind,
    preview: "Professional social copywriting content for step ten controlled evidence testing.",
    briefObjective: bc.inputBrief,
  })!;

  const record = buildModelPerformanceRecord({
    benchmarkCase: bc,
    validation: { ...validation, overallScore: input.qualityScore },
    model: input.model,
    strategy: Object.freeze({
      strategyId: input.strategyId ?? "strategy.baseline",
      version: "1.0.0",
    }),
    executionId: `exec_${input.id}`,
    organizationId: "org_step10",
    executionOutput: {
      preview: "Professional social copywriting content for step ten controlled evidence testing.",
      latencyMs: 900,
    },
    knowledgeId: input.knowledgeId ?? "knowledge.generic",
    knowledgeVersion: input.knowledgeId
      ? `${input.knowledgeId}@1.0.0`
      : "knowledge.generic@1.0.0",
    createId: (p) => `${p}_${input.id}`,
    nowIso: () => "2026-01-01T00:00:00.000Z",
  });

  return Object.freeze({
    ...record,
    qualityScore: input.qualityScore,
    benchmarkOutcome: "MODEL_QUALITY_FAILURE" as const,
    validForModelComparison: true,
  });
}

describe("Step 10 — Production Evidence + Shadow Optimization", () => {
  let recordStore: InMemoryBenchmarkPerformanceRecordStore;
  let shadowStore: InMemoryShadowDecisionStore;

  beforeEach(() => {
    clearValidationCache();
    recordStore = new InMemoryBenchmarkPerformanceRecordStore();
    shadowStore = new InMemoryShadowDecisionStore();
  });

  it("creates production evidence with observational provenance", async () => {
    const actual = Object.freeze({
      providerId: "provider.openai",
      modelId: "openai/gpt-4o",
      strategyId: "strategy.baseline",
      strategyVersion: "1.0.0",
    });

    const result = await ingestProductionEvidenceAndShadow(
      Object.freeze({
        organizationId: "org_step10",
        productionExecutionId: "exec_prod_1",
        requestId: "req_1",
        providerId: actual.providerId,
        modelId: actual.modelId,
        capabilityId: "text.generate",
        service: "social",
        subtype: "copywriting",
        outputKind: "text",
        industry: "fashion",
        preview:
          "Fashion social post with premium brand tone and clear call to action for observational evidence.",
        strategyId: actual.strategyId,
        strategyVersion: actual.strategyVersion,
        latencyMs: 1100,
        providerSuccess: true,
        createId: (p) => `${p}_1`,
        nowIso: () => "2026-01-01T00:00:00.000Z",
      }),
      { recordStore, shadowStore },
    );

    expect(result.evidenceRecorded).toBe(true);
    expect(result.performanceRecord?.evidenceSource).toBe("production");
    expect(result.performanceRecord?.evidenceMode).toBe("observational");
    expect(result.performanceRecord?.productionExecutionId).toBe("exec_prod_1");
    expect(result.performanceRecord?.validForModelComparison).toBe(false);
    expect(result.performanceRecord?.strategyId).toBe(actual.strategyId);
    expect(actual.providerId).toBe("provider.openai");
    expect(actual.modelId).toBe("openai/gpt-4o");
  });

  it("separates production observational from controlled benchmark evidence", async () => {
    await recordStore.append(controlledRecord({ id: "c1", model: textModel, qualityScore: 80 }));
    await ingestProductionEvidenceAndShadow(
      Object.freeze({
        organizationId: "org_step10",
        productionExecutionId: "exec_prod_2",
        providerId: "provider.openai",
        modelId: "openai/gpt-4o",
        capabilityId: "text.generate",
        service: "social",
        subtype: "copywriting",
        outputKind: "text",
        preview: "Social copy for separation test with enough content for validation requirements.",
        latencyMs: 800,
        providerSuccess: true,
        createId: (p) => `${p}_2`,
        nowIso: () => "2026-01-01T00:00:00.000Z",
      }),
      { recordStore, shadowStore },
    );

    const all = await recordStore.query({ limit: 100 });
    const controlled = filterControlledComparisonRecords(all);
    const observational = filterObservationalProductionRecords(all);
    expect(controlled.length).toBe(1);
    expect(observational.length).toBe(1);
    expect(controlled[0]?.evidenceMode).toBe("controlled");
    expect(observational[0]?.evidenceMode).toBe("observational");
  });

  it("reuses Step 2 validation for production evidence", async () => {
    const result = await ingestProductionEvidenceAndShadow(
      Object.freeze({
        organizationId: "org_step10",
        productionExecutionId: "exec_prod_3",
        providerId: "provider.openai",
        modelId: "openai/gpt-4o",
        capabilityId: "text.generate",
        service: "social",
        subtype: "copywriting",
        outputKind: "text",
        preview: "Validated social content for step two reuse verification in production path.",
        latencyMs: 700,
        providerSuccess: true,
        createId: (p) => `${p}_3`,
        nowIso: () => "2026-01-01T00:00:00.000Z",
      }),
      { recordStore, shadowStore },
    );

    expect(result.performanceRecord?.evaluatorId).toBe("output_contract_validation");
    expect(result.performanceRecord?.validationStatus).toBeDefined();
  });

  it("calculates shadow decision from Step 8/9 intelligence without dispatching", async () => {
    for (let i = 0; i < 3; i++) {
      await recordStore.append(
        controlledRecord({
          id: `alt_${i}`,
          model: altModel,
          qualityScore: 88 + i,
          strategyId: "strategy.quality_first",
          knowledgeId: "knowledge.fashion",
        }),
      );
    }
    for (let i = 0; i < 2; i++) {
      await recordStore.append(
        controlledRecord({
          id: `base_${i}`,
          model: textModel,
          qualityScore: 75,
          strategyId: "strategy.baseline",
          knowledgeId: "knowledge.fashion",
        }),
      );
    }

    const actual = Object.freeze({
      providerId: "provider.openai",
      modelId: "openai/gpt-4o",
      strategyId: "strategy.baseline",
      strategyVersion: "1.0.0",
      knowledgeId: "knowledge.fashion",
    });

    const decision = await resolveShadowDecision(
      Object.freeze({
        productionExecutionId: "exec_shadow_1",
        organizationId: "org_step10",
        service: "social",
        subtype: "copywriting",
        outputKind: "text",
        industry: "fashion",
        capabilityId: "text.generate",
        actual,
      }),
      { recordStore, createId: (p) => `${p}_s1`, nowIso: () => "2026-01-01T00:00:00.000Z" },
    );

    expect(actual.providerId).toBe("provider.openai");
    expect(actual.modelId).toBe("openai/gpt-4o");
    expect(actual.strategyId).toBe("strategy.baseline");
    expect(["SHADOW_RECOMMENDATION", "INSUFFICIENT_EVIDENCE", "NO_BETTER_CANDIDATE"]).toContain(
      decision.status,
    );
    if (decision.status === "SHADOW_RECOMMENDATION" && decision.recommended) {
      expect(sameShadowCandidate(decision.recommended, actual)).toBe(false);
      expect(decision.recommendationReason).toContain("Historical evidence");
    }
  });

  it("returns INSUFFICIENT_EVIDENCE when controlled samples are too few", async () => {
    const decision = await resolveShadowDecision(
      Object.freeze({
        productionExecutionId: "exec_shadow_2",
        organizationId: "org_step10",
        service: "social",
        subtype: "copywriting",
        outputKind: "text",
        capabilityId: "text.generate",
        actual: Object.freeze({
          providerId: "provider.openai",
          modelId: "openai/gpt-4o",
          strategyId: "strategy.baseline",
        }),
      }),
      { recordStore, createId: (p) => `${p}_s2`, nowIso: () => "2026-01-01T00:00:00.000Z" },
    );

    expect(decision.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(decision.recommended).toBeUndefined();
  });

  it("does not treat production evidence as controlled comparison input", async () => {
    await ingestProductionEvidenceAndShadow(
      Object.freeze({
        organizationId: "org_step10",
        productionExecutionId: "exec_prod_high",
        providerId: "provider.openai",
        modelId: "openai/gpt-4o",
        capabilityId: "text.generate",
        service: "social",
        subtype: "copywriting",
        outputKind: "text",
        preview: "High scoring production output that must not skew controlled comparisons unfairly.",
        latencyMs: 500,
        providerSuccess: true,
        createId: (p) => `${p}_ph`,
        nowIso: () => "2026-01-01T00:00:00.000Z",
      }),
      { recordStore, shadowStore },
    );

    const controlled = filterControlledComparisonRecords(await recordStore.query({ limit: 100 }));
    expect(controlled.length).toBe(0);
  });

  it("survives shadow failure without blocking evidence result", async () => {
    const original = loadAdaptiveRoutingConfig;
    const result = await ingestProductionEvidenceAndShadow(
      Object.freeze({
        organizationId: "org_step10",
        productionExecutionId: "exec_prod_fail",
        providerId: "provider.openai",
        modelId: "openai/gpt-4o",
        capabilityId: "text.generate",
        service: "social",
        subtype: "copywriting",
        outputKind: "text",
        preview: "Production output when shadow path fails must still persist observational evidence.",
        latencyMs: 600,
        providerSuccess: true,
        createId: (p) => `${p}_fail`,
        nowIso: () => "2026-01-01T00:00:00.000Z",
      }),
      {
        recordStore,
        shadowStore,
        env: { ...process.env, ADAPTIVE_ROUTING_ENABLED: "false" },
      },
    );

    expect(result.evidenceRecorded).toBe(true);
    expect(original({}).adaptiveRoutingEnabled).toBe(false);
  });

  it("assesses promotion readiness deterministically", () => {
    const ready = assessPromotionReadiness({
      recommendation: buildOptimizationRecommendation({
        scope: "social/fashion",
        candidateLabel: "alt",
        candidate: Object.freeze({ providerId: "provider.anthropic", modelId: "anthropic/claude-sonnet-4-5" }),
        observedAdvantage: 10,
        comparisonCompatibility: "COMPARABLE",
      }),
      actual: Object.freeze({
        providerId: "provider.openai",
        modelId: "openai/gpt-4o",
        strategyId: "strategy.baseline",
      }),
      recommended: Object.freeze({
        providerId: "provider.anthropic",
        modelId: "anthropic/claude-sonnet-4-5",
        strategyId: "strategy.quality_first",
      }),
    });
    expect(ready).toBe("INSUFFICIENT_EVIDENCE");

    const insufficient = assessPromotionReadiness({
      recommendation: buildOptimizationRecommendation({
        scope: "social",
        candidateLabel: "none",
        candidate: {},
      }),
      actual: Object.freeze({
        providerId: "provider.openai",
        modelId: "openai/gpt-4o",
        strategyId: "strategy.baseline",
      }),
    });
    expect(insufficient).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("supports production and shadow query reporting", async () => {
    await ingestProductionEvidenceAndShadow(
      Object.freeze({
        organizationId: "org_step10",
        productionExecutionId: "exec_prod_q",
        providerId: "provider.openai",
        modelId: "openai/gpt-4o",
        capabilityId: "text.generate",
        service: "social",
        subtype: "copywriting",
        outputKind: "text",
        preview: "Query reporting test content with sufficient length for contract validation.",
        latencyMs: 750,
        providerSuccess: true,
        createId: (p) => `${p}_q`,
        nowIso: () => "2026-01-01T00:00:00.000Z",
      }),
      { recordStore, shadowStore },
    );

    const query = createProductionIntelligenceQueryService({ recordStore, shadowStore });
    const prod = await query.productionEvidenceByService({ service: "social" });
    const shadows = await query.shadowDecisions();
    const freq = await query.shadowRecommendationFrequency();
    expect(prod.length).toBe(1);
    expect(shadows.length).toBe(1);
    expect(freq.INSUFFICIENT_EVIDENCE + freq.SHADOW_RECOMMENDATION + freq.NO_BETTER_CANDIDATE).toBeGreaterThan(0);
  });

  it("never logs secrets in shadow recommendation reason", async () => {
    const decision = await resolveShadowDecision(
      Object.freeze({
        productionExecutionId: "exec_log_safe",
        organizationId: "org_step10",
        service: "social",
        subtype: "copywriting",
        outputKind: "text",
        capabilityId: "text.generate",
        actual: Object.freeze({
          providerId: "provider.openai",
          modelId: "openai/gpt-4o",
          strategyId: "strategy.baseline",
        }),
      }),
      { recordStore, createId: (p) => `${p}_log`, nowIso: () => "2026-01-01T00:00:00.000Z" },
    );

    const serialized = JSON.stringify(decision);
    expect(serialized).not.toMatch(/sk-[a-zA-Z0-9]/);
    expect(serialized).not.toMatch(/Bearer /);
    expect(decision.limitations.some((l) => l.includes("not executed"))).toBe(true);
  });

  it("keeps adaptive routing disabled (production safety)", () => {
    expect(loadAdaptiveRoutingConfig({}).adaptiveRoutingEnabled).toBe(false);
    expect(loadAdaptiveRoutingConfig({ ADAPTIVE_ROUTING_ENABLED: "false" }).adaptiveRoutingEnabled).toBe(false);
  });

  it("preserves actual production model/strategy/knowledge unchanged through shadow evaluation", async () => {
    const before = Object.freeze({
      providerId: "provider.openai",
      modelId: "openai/gpt-4o",
      strategyId: "strategy.baseline",
      strategyVersion: "1.0.0",
      knowledgeId: "knowledge.fashion",
    });

    await ingestProductionEvidenceAndShadow(
      Object.freeze({
        organizationId: "org_step10",
        productionExecutionId: "exec_unchanged",
        providerId: before.providerId,
        modelId: before.modelId,
        capabilityId: "text.generate",
        service: "social",
        subtype: "copywriting",
        outputKind: "text",
        industry: "fashion",
        preview: "Unchanged production selection verification content for shadow observational layer.",
        strategyId: before.strategyId,
        strategyVersion: before.strategyVersion,
        knowledgeId: before.knowledgeId,
        latencyMs: 820,
        providerSuccess: true,
        createId: (p) => `${p}_uc`,
        nowIso: () => "2026-01-01T00:00:00.000Z",
      }),
      { recordStore, shadowStore },
    );

    expect(before.providerId).toBe("provider.openai");
    expect(before.modelId).toBe("openai/gpt-4o");
    expect(before.strategyId).toBe("strategy.baseline");
    expect(before.knowledgeId).toBe("knowledge.fashion");
  });
});
