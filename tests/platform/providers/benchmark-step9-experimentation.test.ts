/**
 * Step 9 — Strategy + Knowledge Optimization / Controlled Experimentation tests.
 * No paid API calls — deterministic mocks only.
 */

import {
  buildExperimentMatrix,
  planExperimentBudget,
  assertExperimentBudget,
  checkFairComparison,
  runExperiment,
  createExperimentAnalysisService,
  buildOptimizationRecommendation,
  formatExperimentRunReport,
  getExperimentStrategy,
  getKnowledgeContext,
  listExperimentStrategies,
  listKnowledgeContexts,
  isStrategyApplicable,
  isKnowledgeApplicable,
  knowledgeVersionTag,
  DEFAULT_EXPERIMENT_BUDGET,
  DEFAULT_BENCHMARK_STRATEGY,
  buildModelPerformanceRecord,
  getBenchmarkCase,
  InMemoryBenchmarkPerformanceRecordStore,
  type BenchmarkModelTarget,
  type ModelPerformanceRecord,
} from "../../../src/platform/providers/routing/performance/benchmark";
import { validateOutputContract, clearValidationCache } from "../../../src/platform/os/evaluation/output-validation";
import { loadAdaptiveRoutingConfig } from "../../../src/platform/providers/routing/performance/config/adaptive-routing-config";
import { ControllableDispatcher } from "../../../src/platform/providers/runtime/testing";
import { createBenchmarkProviderExecutor } from "../../../src/platform/providers/routing/performance/benchmark";

const textModel: BenchmarkModelTarget = Object.freeze({
  providerId: "provider.openai",
  modelId: "openai/gpt-4o",
  capabilityId: "text.generate",
});

function mockRecord(input: {
  readonly id: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly benchmarkId: string;
  readonly service: string;
  readonly industry?: string;
  readonly qualityScore: number;
  readonly strategyId?: string;
  readonly knowledgeId?: string;
  readonly knowledgeVersion?: string;
  readonly knowledgeFingerprint?: string;
  readonly experimentId?: string;
}): ModelPerformanceRecord {
  clearValidationCache();
  const bc = getBenchmarkCase(input.benchmarkId)!;
  const validation = validateOutputContract({
    organizationId: "org_step9",
    executionId: `exec_${input.id}`,
    service: input.service,
    subtype: bc.subtype,
    outputKind: bc.outputKind,
    preview: "Professional deliverable content for step nine experiment testing with sufficient length.",
    briefObjective: bc.inputBrief,
  })!;

  const strategy = input.strategyId
    ? Object.freeze({
        strategyId: input.strategyId,
        version: "1.0.0",
        label: input.strategyId,
      })
    : DEFAULT_BENCHMARK_STRATEGY;

  const record = buildModelPerformanceRecord({
    benchmarkCase: bc,
    validation: {
      ...validation,
      overallScore: input.qualityScore,
    },
    model: Object.freeze({
      providerId: input.providerId,
      modelId: input.modelId,
      capabilityId: "text.generate",
    }),
    strategy,
    executionId: `exec_${input.id}`,
    organizationId: "org_step9",
    executionOutput: {
      preview: "Professional deliverable content for step nine experiment testing with sufficient length.",
      latencyMs: 900,
    },
    knowledgeVersion: input.knowledgeVersion,
    knowledgeId: input.knowledgeId,
    knowledgeFingerprint: input.knowledgeFingerprint,
    experimentId: input.experimentId,
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

describe("Step 9 — Strategy + Knowledge Experimentation", () => {
  beforeEach(() => {
    clearValidationCache();
  });

  it("preserves strategy identity and versioning", () => {
    const strategies = listExperimentStrategies();
    expect(strategies.length).toBeGreaterThanOrEqual(3);
    const baseline = getExperimentStrategy("strategy.baseline", "1.0.0");
    expect(baseline?.strategyId).toBe("strategy.baseline");
    expect(baseline?.version).toBe("1.0.0");
    expect(baseline?.configuration).toBeDefined();
  });

  it("preserves knowledge identity, version, and fingerprint", () => {
    const contexts = listKnowledgeContexts();
    expect(contexts.length).toBeGreaterThanOrEqual(3);
    const fashion = getKnowledgeContext("knowledge.fashion", "3.0.0");
    expect(fashion?.knowledgeId).toBe("knowledge.fashion");
    expect(fashion?.contentFingerprint).toMatch(/^[a-f0-9]{16}$/);
    expect(knowledgeVersionTag(fashion!)).toBe("knowledge.fashion@3.0.0");
  });

  it("filters applicability for strategy and knowledge", () => {
    const latency = getExperimentStrategy("strategy.latency_first", "1.0.0")!;
    const presentationBc = getBenchmarkCase("bench.presentations.pitch-decks")!;
    expect(isStrategyApplicable(latency, presentationBc).applicable).toBe(false);

    const seo = getKnowledgeContext("knowledge.seo_irrelevant_image", "1.0.0")!;
    expect(
      isKnowledgeApplicable(seo, {
        service: "image",
        subtype: "product-mockup",
        outputKind: "image",
      }).applicable,
    ).toBe(false);
  });

  it("builds deterministic experiment matrix fingerprints", () => {
    const plan = buildExperimentMatrix({
      experimentId: "exp_step9_matrix",
      benchmarkIds: ["bench.social.copywriting"],
      models: [textModel],
      strategies: [
        getExperimentStrategy("strategy.baseline", "1.0.0")!,
        getExperimentStrategy("strategy.quality_first", "1.0.0")!,
      ],
      knowledgeContexts: [
        getKnowledgeContext("knowledge.generic", "1.0.0")!,
      ],
      repeatCount: 2,
      comparisonMode: "strategy",
    });
    expect(plan.executableCells.length).toBeGreaterThan(0);
    expect(plan.cells[0]?.fingerprint).toHaveLength(24);
    expect(plan.totalInvocations).toBe(plan.executableCells.length);
  });

  it("rejects budget overrun before execution", () => {
    const plan = buildExperimentMatrix({
      experimentId: "exp_budget",
      benchmarkIds: ["bench.social.copywriting", "bench.print.brochures"],
      models: [textModel],
      strategies: listExperimentStrategies(),
      knowledgeContexts: listKnowledgeContexts(),
      repeatCount: 3,
    });
    const budgetPlan = planExperimentBudget({
      matrix: plan,
      budget: Object.freeze({ ...DEFAULT_EXPERIMENT_BUDGET, maxInvocations: 2 }),
    });
    expect(budgetPlan.withinBudget).toBe(false);
    expect(() =>
      assertExperimentBudget({
        matrix: plan,
        budget: Object.freeze({ ...DEFAULT_EXPERIMENT_BUDGET, maxInvocations: 2 }),
      }),
    ).toThrow(/budget exceeded/i);
  });

  it("enforces fair strategy comparison (only strategy may differ)", () => {
    const a = mockRecord({
      id: "a",
      providerId: "provider.openai",
      modelId: "openai/gpt-4o",
      benchmarkId: "bench.social.copywriting",
      service: "social",
      qualityScore: 78,
      strategyId: "strategy.baseline",
      knowledgeId: "knowledge.generic",
      knowledgeVersion: "knowledge.generic@1.0.0",
      knowledgeFingerprint: "fp_generic",
    });
    const b = mockRecord({
      id: "b",
      providerId: "provider.openai",
      modelId: "openai/gpt-4o",
      benchmarkId: "bench.social.copywriting",
      service: "social",
      qualityScore: 88,
      strategyId: "strategy.quality_first",
      knowledgeId: "knowledge.generic",
      knowledgeVersion: "knowledge.generic@1.0.0",
      knowledgeFingerprint: "fp_generic",
    });
    const fair = checkFairComparison({ mode: "strategy", a, b });
    expect(fair.comparable).toBe(true);

    const incomparable = checkFairComparison({
      mode: "strategy",
      a,
      b: { ...b, modelId: "anthropic/claude-sonnet-4-5" },
    });
    expect(incomparable.comparable).toBe(false);
  });

  it("enforces fair knowledge comparison (only knowledge may differ)", () => {
    const a = mockRecord({
      id: "ka",
      providerId: "provider.openai",
      modelId: "openai/gpt-4o",
      benchmarkId: "bench.social.copywriting",
      service: "social",
      qualityScore: 79,
      strategyId: "strategy.baseline",
      knowledgeId: "knowledge.generic",
      knowledgeFingerprint: "fp_generic",
    });
    const b = mockRecord({
      id: "kb",
      providerId: "provider.openai",
      modelId: "openai/gpt-4o",
      benchmarkId: "bench.social.copywriting",
      service: "social",
      qualityScore: 89,
      strategyId: "strategy.baseline",
      knowledgeId: "knowledge.fashion",
      knowledgeFingerprint: "fp_fashion",
    });
    const fair = checkFairComparison({ mode: "knowledge", a, b });
    expect(fair.comparable).toBe(true);
  });

  it("marks identical strategy comparison as INCOMPARABLE", () => {
    const a = mockRecord({
      id: "same_a",
      providerId: "provider.openai",
      modelId: "openai/gpt-4o",
      benchmarkId: "bench.social.copywriting",
      service: "social",
      qualityScore: 80,
      strategyId: "strategy.baseline",
    });
    const fair = checkFairComparison({ mode: "strategy", a, b: a });
    expect(fair.comparable).toBe(false);
  });

  it("runs dry-run experiment without provider calls", async () => {
    const dispatcher = new ControllableDispatcher({ mode: "success" });
    const dispatchSpy = jest.spyOn(dispatcher, "dispatch");
    const executor = createBenchmarkProviderExecutor({ dispatcher });

    const output = await runExperiment({
      experimentId: "exp_dry",
      benchmarkIds: ["bench.social.copywriting"],
      models: [textModel],
      strategies: [getExperimentStrategy("strategy.baseline", "1.0.0")!],
      knowledgeContexts: [getKnowledgeContext("knowledge.generic", "1.0.0")!],
      organizationId: "org_step9",
      dryRun: true,
      executeModel: executor,
    });

    expect(output.dryRun).toBe(true);
    expect(output.status).toBe("PLANNED");
    expect(dispatchSpy).not.toHaveBeenCalled();
    dispatchSpy.mockRestore();
  });

  it("aggregates strategy and knowledge performance with append-only evidence", async () => {
    const store = new InMemoryBenchmarkPerformanceRecordStore();
    const records = [
      mockRecord({
        id: "s1",
        providerId: "provider.openai",
        modelId: "openai/gpt-4o",
        benchmarkId: "bench.social.copywriting",
        service: "social",
        industry: "fashion",
        qualityScore: 78,
        strategyId: "strategy.baseline",
        knowledgeId: "knowledge.generic",
        knowledgeVersion: "knowledge.generic@1.0.0",
        experimentId: "exp_agg",
      }),
      mockRecord({
        id: "s2",
        providerId: "provider.openai",
        modelId: "openai/gpt-4o",
        benchmarkId: "bench.social.copywriting",
        service: "social",
        qualityScore: 88,
        strategyId: "strategy.quality_first",
        knowledgeId: "knowledge.generic",
        knowledgeVersion: "knowledge.generic@1.0.0",
        experimentId: "exp_agg",
      }),
      mockRecord({
        id: "k1",
        providerId: "provider.openai",
        modelId: "openai/gpt-4o",
        benchmarkId: "bench.social.copywriting",
        service: "social",
        qualityScore: 79,
        strategyId: "strategy.baseline",
        knowledgeId: "knowledge.generic",
        knowledgeVersion: "knowledge.generic@1.0.0",
        experimentId: "exp_agg",
      }),
      mockRecord({
        id: "k2",
        providerId: "provider.openai",
        modelId: "openai/gpt-4o",
        benchmarkId: "bench.social.copywriting",
        service: "social",
        qualityScore: 91,
        strategyId: "strategy.baseline",
        knowledgeId: "knowledge.fashion",
        knowledgeVersion: "knowledge.fashion@3.0.0",
        knowledgeFingerprint: getKnowledgeContext("knowledge.fashion", "3.0.0")!.contentFingerprint,
        experimentId: "exp_agg",
      }),
    ];
    for (const r of records) {
      await store.append(r);
    }
    expect(await store.count()).toBe(4);

    const analysis = createExperimentAnalysisService({ recordStore: store });
    const strategyFp = await analysis.strategyPerformanceForService({
      strategyId: "strategy.quality_first",
      service: "social",
    });
    expect(strategyFp?.qualityScoreMean).toBe(88);

    const knowledgeFps = await analysis.knowledgePerformance({ organizationId: "org_step9" });
    expect(knowledgeFps.length).toBeGreaterThanOrEqual(1);

    const combo = await analysis.combinationPerformance({
      providerId: "provider.openai",
      modelId: "openai/gpt-4o",
      strategyId: "strategy.baseline",
      knowledgeId: "knowledge.fashion",
      service: "social",
    });
    expect(combo?.qualityScoreMean).toBe(91);
  });

  it("returns INSUFFICIENT_EVIDENCE when samples are too few", async () => {
    const store = new InMemoryBenchmarkPerformanceRecordStore();
    await store.append(
      mockRecord({
        id: "one",
        providerId: "provider.openai",
        modelId: "openai/gpt-4o",
        benchmarkId: "bench.social.copywriting",
        service: "social",
        qualityScore: 80,
        strategyId: "strategy.baseline",
      }),
    );
    const analysis = createExperimentAnalysisService({ recordStore: store });
    const rec = await analysis.recommendBestStrategy({
      providerId: "provider.openai",
      modelId: "openai/gpt-4o",
      service: "social",
      strategyIds: ["strategy.baseline", "strategy.quality_first"],
    });
    expect(rec.recommendationStatus).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("generates recommendation with observed advantage when evidence exists", async () => {
    const store = new InMemoryBenchmarkPerformanceRecordStore();
    for (let i = 0; i < 3; i++) {
      await store.append(
        mockRecord({
          id: `b_${i}`,
          providerId: "provider.openai",
          modelId: "openai/gpt-4o",
          benchmarkId: "bench.social.copywriting",
          service: "social",
          qualityScore: 78,
          strategyId: "strategy.baseline",
        }),
      );
      await store.append(
        mockRecord({
          id: `q_${i}`,
          providerId: "provider.openai",
          modelId: "openai/gpt-4o",
          benchmarkId: "bench.social.copywriting",
          service: "social",
          qualityScore: 88,
          strategyId: "strategy.quality_first",
        }),
      );
    }
    const analysis = createExperimentAnalysisService({ recordStore: store });
    const rec = await analysis.recommendBestStrategy({
      providerId: "provider.openai",
      modelId: "openai/gpt-4o",
      service: "social",
      strategyIds: ["strategy.baseline", "strategy.quality_first"],
    });
    expect(rec.recommendationStatus).toBe("RECOMMENDATION");
    expect(rec.candidate.strategyId).toBe("strategy.quality_first");
    expect(rec.validComparisonSamples).toBeGreaterThanOrEqual(2);
  });

  it("buildOptimizationRecommendation uses evidence tier wording", () => {
    const rec = buildOptimizationRecommendation({
      scope: "social/fashion",
      candidateLabel: "strategy.quality_first",
      candidate: { strategyId: "strategy.quality_first" },
      fingerprint: {
        providerId: "provider.openai",
        modelId: "openai/gpt-4o",
        service: "social",
        sampleCount: 3,
        successfulSamples: 3,
        failedSamples: 0,
        validComparisonSamples: 3,
        operationalFailureSamples: 0,
        hardRequirementPassRateMean: 0.8,
        qualityScoreMean: 88,
        qualityDimensions: {},
        measuredQualityDimensions: [],
        unmeasuredQualityDimensions: [],
        latencyMsMean: 1000,
        latencyMsMedian: 1000,
        operationalFailureRate: 0,
        failureProfile: {},
        confidence: Object.freeze({
          level: "medium",
          sampleCount: 3,
          recencyWeight: 1,
          reason: "3 valid samples",
        }),
        windowStart: "2026-01-01T00:00:00.000Z",
        windowEnd: "2026-01-01T00:00:00.000Z",
      },
      observedAdvantage: 10,
    });
    expect(rec.recommendationStatus).toBe("RECOMMENDATION");
    expect(rec.limitations.some((l) => l.includes("controlled conditions"))).toBe(true);
  });

  it("formats experiment report with provenance fields", async () => {
    const store = new InMemoryBenchmarkPerformanceRecordStore();
    const record = mockRecord({
      id: "rep",
      providerId: "provider.openai",
      modelId: "openai/gpt-4o",
      benchmarkId: "bench.social.copywriting",
      service: "social",
      qualityScore: 85,
      strategyId: "strategy.baseline",
      knowledgeId: "knowledge.generic",
      experimentId: "exp_report",
    });
    const plan = buildExperimentMatrix({
      experimentId: "exp_report",
      benchmarkIds: ["bench.social.copywriting"],
      models: [textModel],
      strategies: [getExperimentStrategy("strategy.baseline", "1.0.0")!],
      knowledgeContexts: [getKnowledgeContext("knowledge.generic", "1.0.0")!],
    });
    const budgetPlan = planExperimentBudget({ matrix: plan, budget: DEFAULT_EXPERIMENT_BUDGET });
    const report = formatExperimentRunReport({
      experimentId: "exp_report",
      experimentVersion: "1.0.0",
      status: "COMPLETED",
      plan,
      budget: budgetPlan,
      records: [record],
      sampleCount: 1,
      successfulSamples: 0,
      failedSamples: 1,
      validComparisonSamples: 1,
      operationalFailures: 0,
    });
    expect(report).toContain("Strategy:");
    expect(report).toContain("Knowledge:");
    expect(report).toContain("Valid comparison samples:");
  });

  it("keeps adaptive routing disabled (production safety)", () => {
    expect(loadAdaptiveRoutingConfig({}).adaptiveRoutingEnabled).toBe(false);
  });
});
