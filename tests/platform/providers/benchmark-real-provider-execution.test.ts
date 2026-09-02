import {
  createBenchmarkProviderExecutor,
  createRealBenchmarkExecutionService,
  planBenchmarkInvocations,
  assertBenchmarkBudget,
  resolveBenchmarkCapability,
  normalizeProviderResponseForBenchmark,
  buildBenchmarkRunReport,
  runBenchmark,
  getBenchmarkCase,
  assertPilotBenchmarksAvailable,
  PILOT_BENCHMARK_IDS,
  DEFAULT_BENCHMARK_STRATEGY,
  InMemoryBenchmarkPerformanceRecordStore,
  checkComparisonCompatibility,
  EvidenceOnlyPerformanceIntelligence,
  buildSmokeRunConfig,
  SMOKE_DEFAULT_BENCHMARK_IDS,
  SMOKE_DEFAULT_MODEL_SPECS,
  type BenchmarkModelTarget,
} from "../../../src/platform/providers/routing/performance/benchmark";
import { loadAdaptiveRoutingConfig } from "../../../src/platform/providers/routing/performance/config/adaptive-routing-config";
import { ControllableDispatcher } from "../../../src/platform/providers/runtime/testing";
import { createModelRegistryPlatform } from "../../../src/platform/model-registry/factories/create-model-registry-platform";
import { DefaultCompatibilityEngine } from "../../../src/platform/model-registry/compatibility/default-compatibility-engine";
import { asProviderId } from "../../../src/platform/core/identifiers";
import { validateOutputContract, clearValidationCache } from "../../../src/platform/os/evaluation/output-validation";

describe("Step 4A — Real Provider Benchmark Execution", () => {
  beforeEach(() => clearValidationCache());

  const modelA: BenchmarkModelTarget = Object.freeze({
    providerId: "provider.openai",
    modelId: "openai/gpt-4o",
    modelVersion: "2024-08-06",
    capabilityId: "text.generate",
  });

  const modelB: BenchmarkModelTarget = Object.freeze({
    providerId: "provider.anthropic",
    modelId: "anthropic/claude-sonnet-4-5",
    capabilityId: "text.generate",
  });

  function mockDispatcher(_content = "Professional branding deliverable with logo specifications") {
    return new ControllableDispatcher({ mode: "success" });
  }

  describe("provider adapter integration", () => {
    it("executor calls IProviderDispatcher with explicit provider/model (no routing)", async () => {
      const dispatcher = mockDispatcher();
      const dispatchSpy = jest.spyOn(dispatcher, "dispatch");
      const registryPlatform = createModelRegistryPlatform({ loadSeed: true });

      const executor = createBenchmarkProviderExecutor({
        dispatcher,
        modelRegistry: registryPlatform.registry,
        pricingEngine: registryPlatform.pricing,
        compatibilityEngine: new DefaultCompatibilityEngine(),
      });

      const bc = getBenchmarkCase("bench.social.copywriting")!;
      await executor({
        benchmarkCase: bc,
        model: modelA,
        strategy: DEFAULT_BENCHMARK_STRATEGY,
        organizationId: "org_bench",
        executionId: "benchexec_1",
      });

      expect(dispatchSpy).toHaveBeenCalledTimes(1);
      const req = dispatchSpy.mock.calls[0]![0];
      expect(String(req.providerId)).toBe("provider.openai");
      expect(req.modelId).toBeTruthy();
      expect(req.metadata?.preferredProviderId).toBe("provider.openai");
      expect(req.metadata?.executionMode).toBe("benchmark");
      expect(req.context.attributes?.executionMode).toBe("benchmark");
      expect(req.payload.prompt).toBe(bc.inputBrief);
      dispatchSpy.mockRestore();
    });

    it("uses same fixed benchmark input for different models", async () => {
      const dispatcher = mockDispatcher();
      const dispatchSpy = jest.spyOn(dispatcher, "dispatch");
      const executor = createBenchmarkProviderExecutor({ dispatcher });
      const bc = getBenchmarkCase("bench.social.copywriting")!;

      await executor({
        benchmarkCase: bc,
        model: modelA,
        strategy: DEFAULT_BENCHMARK_STRATEGY,
        organizationId: "org_bench",
        executionId: "exec_a",
      });
      await executor({
        benchmarkCase: bc,
        model: modelB,
        strategy: DEFAULT_BENCHMARK_STRATEGY,
        organizationId: "org_bench",
        executionId: "exec_b",
      });

      const briefA = dispatchSpy.mock.calls[0]![0].payload.prompt;
      const briefB = dispatchSpy.mock.calls[1]![0].payload.prompt;
      expect(briefA).toBe(briefB);
      expect(briefA).toBe(bc.inputBrief);
      dispatchSpy.mockRestore();
    });
  });

  describe("capability resolution", () => {
    it("maps logo-design output kind to image.generate capability", () => {
      const bc = getBenchmarkCase("bench.branding.logo-design")!;
      const resolved = resolveBenchmarkCapability(bc);
      expect(resolved.modality).toBe("image");
      expect(resolved.capabilityId).toBe("image.generate");
    });

    it("maps copywriting output kind to text.generate capability", () => {
      const bc = getBenchmarkCase("bench.social.copywriting")!;
      const resolved = resolveBenchmarkCapability(bc);
      expect(resolved.modality).toBe("text");
      expect(resolved.capabilityId).toBe("text.generate");
    });

    it("records unsupported capability without fabricating output", async () => {
      const dispatcher = mockDispatcher();
      const registryPlatform = createModelRegistryPlatform({ loadSeed: true });
      const compat = new DefaultCompatibilityEngine();

      const executor = createBenchmarkProviderExecutor({
        dispatcher,
        modelRegistry: registryPlatform.registry,
        compatibilityEngine: compat,
      });

      const imageCase = getBenchmarkCase("bench.branding.logo-design")!;
      const fakeImageModel: BenchmarkModelTarget = Object.freeze({
        providerId: "provider.openai",
        modelId: "openai/gpt-4o",
        capabilityId: "text.generate",
      });

      const resolved = resolveBenchmarkCapability({
        ...imageCase,
        outputKind: "image",
      });
      expect(resolved.capabilityId).toBe("image.generate");

      const output = await executor({
        benchmarkCase: { ...imageCase, outputKind: "image" },
        model: fakeImageModel,
        strategy: DEFAULT_BENCHMARK_STRATEGY,
        organizationId: "org_bench",
        executionId: "exec_unsup",
      });

      expect(output.skippedPreFlight).toBe(true);
      expect(output.compatibility?.outcomeIfSkipped).toBe("MODEL_CAPABILITY_UNSUPPORTED");
      expect(output.preview).toBe("");
    });
  });

  describe("output capture and validation", () => {
    it("captures actual provider output and runs Step 2 validation", async () => {
      const store = new InMemoryBenchmarkPerformanceRecordStore();
      const dispatcher = mockDispatcher("Detailed logo design with typography and brand colors for fashion");
      const validationSpy = jest.spyOn(
        require("../../../src/platform/os/evaluation/output-validation/output-contract-validation-engine"),
        "validateOutputContract",
      );

      const executor = createBenchmarkProviderExecutor({ dispatcher });
      const { record } = await runBenchmark(
        {
          benchmarkId: "bench.social.copywriting",
          model: modelA,
          organizationId: "org_bench",
          executeModel: executor,
        },
        { recordStore: store },
      );

      expect(validationSpy).toHaveBeenCalled();
      expect(record.qualityScore).toBeDefined();
      expect(record.hardRequirementsTotal).toBeGreaterThan(0);
      validationSpy.mockRestore();
    });

    it("normalizes provider response to preview and structured data", () => {
      const bc = getBenchmarkCase("bench.print.brochures")!;
      const normalized = normalizeProviderResponseForBenchmark(
        {
          requestId: "r1",
          providerId: asProviderId("provider.openai"),
          output: { content: '{"sections":[{"title":"Intro"}]}' },
          streamed: false,
          finishedAt: new Date().toISOString(),
        },
        bc,
      );
      expect(normalized.preview).toContain("sections");
    });
  });

  describe("latency and cost", () => {
    it("records total and model latency from dispatcher", async () => {
      const dispatcher = mockDispatcher();
      const executor = createBenchmarkProviderExecutor({
        dispatcher,
        clockMs: (() => {
          let t = 1000;
          return () => (t += 100);
        })(),
      });

      const output = await executor({
        benchmarkCase: getBenchmarkCase("bench.social.copywriting")!,
        model: modelA,
        strategy: DEFAULT_BENCHMARK_STRATEGY,
        organizationId: "org_bench",
        executionId: "exec_lat",
      });

      expect(output.latencyMs).toBeGreaterThan(0);
      expect(output.modelLatencyMs).toBeGreaterThan(0);
    });

    it("marks cost unavailable when pricing cannot be determined", async () => {
      const dispatcher = mockDispatcher();
      const executor = createBenchmarkProviderExecutor({ dispatcher });
      const store = new InMemoryBenchmarkPerformanceRecordStore();

      const { record } = await runBenchmark(
        {
          benchmarkId: "bench.social.copywriting",
          model: modelA,
          organizationId: "org_bench",
          executeModel: executor,
        },
        { recordStore: store },
      );

      expect(record.costAvailable).toBe(false);
    });
  });

  describe("operational failures", () => {
    it("classifies dispatch failures separately from quality", async () => {
      const dispatcher = new ControllableDispatcher({ mode: "fail" });
      const executor = createBenchmarkProviderExecutor({ dispatcher });
      const store = new InMemoryBenchmarkPerformanceRecordStore();

      const { record } = await runBenchmark(
        {
          benchmarkId: "bench.social.copywriting",
          model: modelA,
          organizationId: "org_bench",
          executeModel: executor,
        },
        { recordStore: store },
      );

      expect(record.reliabilityStatus).toBe("operational_failure");
      expect(record.operationalFailureCategory).toBeTruthy();
    });
  });

  describe("budget protection", () => {
    it("blocks runs exceeding max invocations", () => {
      const plan = planBenchmarkInvocations({
        benchmarkIds: PILOT_BENCHMARK_IDS as unknown as string[],
        models: [modelA, modelB],
        repeatCount: 5,
        budget: { maxInvocations: 10, largeRunThreshold: 5 },
      });
      expect(plan.withinMaxInvocations).toBe(false);
      expect(() => assertBenchmarkBudget(plan, { maxInvocations: 10, largeRunThreshold: 5 })).toThrow(
        /budget exceeded/i,
      );
    });

    it("pilot plan fits within pilot budget", () => {
      const plan = planBenchmarkInvocations({
        benchmarkIds: [...PILOT_BENCHMARK_IDS],
        models: [modelA],
        repeatCount: 1,
        budget: { maxInvocations: 12, largeRunThreshold: 12, allowLargeRunOverride: true },
      });
      expect(plan.withinMaxInvocations).toBe(true);
    });
  });

  describe("repeat execution", () => {
    it("preserves separate evidence for repeated runs", async () => {
      const store = new InMemoryBenchmarkPerformanceRecordStore();
      const dispatcher = mockDispatcher();
      const executor = createBenchmarkProviderExecutor({ dispatcher });

      const service = createRealBenchmarkExecutionService({
        recordStore: store,
        executorDeps: { dispatcher },
      });

      const output = await service.runControlled({
        benchmarkIds: ["bench.social.copywriting"],
        models: [modelA],
        organizationId: "org_bench",
        repeatConfig: { repeatCount: 3, nondeterministic: true },
        budget: { maxInvocations: 10, largeRunThreshold: 10, allowLargeRunOverride: true },
        executeModel: executor,
      });

      expect(output.results.length).toBe(3);
      const ids = new Set(output.results.map((r) => r.record.performanceRecordId));
      expect(ids.size).toBe(3);
    });
  });

  describe("reporting", () => {
    it("builds human-readable report with measured/unmeasured dimensions", async () => {
      const store = new InMemoryBenchmarkPerformanceRecordStore();
      const dispatcher = mockDispatcher();
      const executor = createBenchmarkProviderExecutor({ dispatcher });

      const { record, conditions } = await runBenchmark(
        {
          benchmarkId: "bench.social.copywriting",
          model: modelA,
          organizationId: "org_bench",
          knowledgeVersion: "kv_1",
          executeModel: executor,
        },
        { recordStore: store },
      );

      const bc = getBenchmarkCase("bench.social.copywriting")!;
      const report = buildBenchmarkRunReport({ benchmarkCase: bc, record, conditions });

      expect(report.textReport).toContain("Hard Requirements");
      expect(report.textReport).toContain("Benchmark outcome");
      expect(report.textReport).toContain("kv_1");
      expect(report.calibration.benchmarkOutcome).toBeTruthy();
    });

    it("comparison report exposes compatibility status", async () => {
      const store = new InMemoryBenchmarkPerformanceRecordStore();
      const dispatcher = mockDispatcher();
      const executor = createBenchmarkProviderExecutor({ dispatcher });
      const service = createRealBenchmarkExecutionService({ recordStore: store, executorDeps: { dispatcher } });

      const r1 = await runBenchmark(
        {
          benchmarkId: "bench.social.copywriting",
          model: modelA,
          organizationId: "org_bench",
          knowledgeVersion: "kv_1",
          executeModel: executor,
        },
        { recordStore: store },
      );
      const r2 = await runBenchmark(
        {
          benchmarkId: "bench.social.copywriting",
          model: modelB,
          organizationId: "org_bench",
          knowledgeVersion: "kv_2",
          executeModel: executor,
        },
        { recordStore: store },
      );

      const comparison = service.compareBenchmark(
        "bench.social.copywriting",
        [r1, r2],
        r1,
      );
      expect(comparison.entries.length).toBe(2);
      expect(comparison.entries[1]!.compatibility.compatible).toBe(false);
      expect(comparison.textReport).toContain("No automatic winner");
    });
  });

  describe("pilot catalog", () => {
    it("pilot benchmarks exist in catalog", () => {
      expect(() => assertPilotBenchmarksAvailable()).not.toThrow();
      expect(PILOT_BENCHMARK_IDS.length).toBeGreaterThanOrEqual(10);
    });
  });

  describe("smoke run configuration", () => {
    const readyProviders = SMOKE_DEFAULT_MODEL_SPECS.map((s) =>
      Object.freeze({ providerId: s.providerId, enabled: true, configured: true }),
    );

    it("defaults to two cross-provider models and six pilot benchmarks within budget", () => {
      const config = buildSmokeRunConfig({ readyProviders });
      expect(config.models).toHaveLength(2);
      expect(new Set(config.models.map((m) => m.providerId)).size).toBe(2);
      expect(config.benchmarkIds).toEqual([...SMOKE_DEFAULT_BENCHMARK_IDS]);
      expect(config.plan.totalInvocations).toBe(12);
      expect(config.plan.withinMaxInvocations).toBe(true);
    });

    it("rejects more than two smoke models", () => {
      expect(() =>
        buildSmokeRunConfig({
          readyProviders,
          env: {
            BENCHMARK_SMOKE_MODELS:
              "provider.openai:openai/gpt-4o,provider.anthropic:anthropic/claude-sonnet-4-5,provider.gemini:gemini/gemini-3.6-flash",
          } as NodeJS.ProcessEnv,
        }),
      ).toThrow(/exactly 2 model targets/i);
    });

    it("rejects benchmark subsets that exceed pilot budget", () => {
      expect(() =>
        buildSmokeRunConfig({
          readyProviders,
          env: {
            BENCHMARK_SMOKE_BENCHMARK_IDS: PILOT_BENCHMARK_IDS.join(","),
          } as NodeJS.ProcessEnv,
        }),
      ).toThrow(/budget exceeded/i);
    });
  });

  describe("production routing unchanged", () => {
    it("adaptive routing remains disabled", () => {
      expect(loadAdaptiveRoutingConfig({}).adaptiveRoutingEnabled).toBe(false);
    });

    it("blendScore unchanged with evidence-only intelligence", async () => {
      const intel = new EvidenceOnlyPerformanceIntelligence();
      const blended = await intel.blendScore({
        staticTotal: 0.9,
        staticQuality: 0.85,
        staticLatency: 0.8,
        staticCost: 0.7,
        staticHealth: 1,
        strategy: "QUALITY",
        key: { providerId: "openai", modelId: "gpt-4o", capabilityId: "text.generate" },
      });
      expect(blended.total).toBe(0.9);
      expect(blended.explain.usedAdaptiveFeedback).toBe(false);
    });
  });

  describe("version traceability", () => {
    it("records strategy, knowledge, model versions in performance record", async () => {
      const store = new InMemoryBenchmarkPerformanceRecordStore();
      const dispatcher = mockDispatcher();
      const executor = createBenchmarkProviderExecutor({ dispatcher });

      const { record } = await runBenchmark(
        {
          benchmarkId: "bench.social.copywriting",
          model: modelA,
          organizationId: "org_bench",
          strategy: DEFAULT_BENCHMARK_STRATEGY,
          knowledgeVersion: "kv_smoke",
          executeModel: executor,
        },
        { recordStore: store },
      );

      expect(record.strategyVersion).toBe(DEFAULT_BENCHMARK_STRATEGY.version);
      expect(record.knowledgeVersion).toBe("kv_smoke");
      expect(record.modelVersion).toBe(modelA.modelVersion);
      expect(record.evaluatorVersion).toBeTruthy();
    });
  });

  describe("fair comparison", () => {
    it("detects incompatible knowledge versions", async () => {
      const store = new InMemoryBenchmarkPerformanceRecordStore();
      const dispatcher = mockDispatcher();
      const executor = createBenchmarkProviderExecutor({ dispatcher });

      const r1 = await runBenchmark(
        {
          benchmarkId: "bench.social.copywriting",
          model: modelA,
          organizationId: "org",
          knowledgeVersion: "kv_1",
          executeModel: executor,
        },
        { recordStore: store },
      );
      const r2 = await runBenchmark(
        {
          benchmarkId: "bench.social.copywriting",
          model: modelB,
          organizationId: "org",
          knowledgeVersion: "kv_2",
          executeModel: executor,
        },
        { recordStore: store },
      );

      expect(checkComparisonCompatibility(r1.record, r2.record).compatible).toBe(false);
    });
  });
});
