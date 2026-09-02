import {
  buildBenchmarkCatalog,
  buildBenchmarkSuites,
  getBenchmarkCase,
  runBenchmark,
  runBenchmarkSuite,
  resetBenchmarkRunnerState,
  resetBenchmarkCatalogCache,
  InMemoryBenchmarkPerformanceRecordStore,
  buildModelPerformanceRecord,
  checkComparisonCompatibility,
  computePerformanceConfidence,
  aggregateRecordsInMemory,
  detectRegressions,
  auditBenchmarkCoverage,
  assertFullBenchmarkCoverage,
  EvidenceOnlyPerformanceIntelligence,
  persistBenchmarkToPerformanceStore,
  DEFAULT_BENCHMARK_STRATEGY,
  type BenchmarkModelTarget,
} from "../../../src/platform/providers/routing/performance/benchmark";
import { validateOutputContract, clearValidationCache } from "../../../src/platform/os/evaluation/output-validation";
import { InMemoryModelPerformanceStore } from "../../../src/platform/providers/routing/performance/stores/in-memory-model-performance-store";
import { loadAdaptiveRoutingConfig } from "../../../src/platform/providers/routing/performance/config/adaptive-routing-config";

describe("Step 3 — Benchmark + Model Performance Evaluation", () => {
  beforeEach(() => {
    clearValidationCache();
    resetBenchmarkRunnerState();
    resetBenchmarkCatalogCache();
  });

  const modelA: BenchmarkModelTarget = Object.freeze({
    providerId: "openai",
    modelId: "gpt-4o",
    modelVersion: "2024-08-06",
    capabilityId: "text.generation",
  });

  const modelB: BenchmarkModelTarget = Object.freeze({
    providerId: "anthropic",
    modelId: "claude-3-5-sonnet",
    modelVersion: "20241022",
    capabilityId: "text.generation",
  });

  const fixedPreview =
    "Professional logo design for Acme Corp with bold typography and brand colors";

  describe("benchmark catalog", () => {
    it("generates cases from full service taxonomy", () => {
      const cases = buildBenchmarkCatalog();
      expect(cases.length).toBeGreaterThan(90);
      const website = cases.find((c) => c.service === "website");
      expect(website).toBeDefined();
    });

    it("includes industry variants for material services", () => {
      const cases = buildBenchmarkCatalog();
      const fashion = cases.find(
        (c) => c.service === "website" && c.industry === "fashion",
      );
      expect(fashion).toBeDefined();
    });

    it("includes social format benchmark cases", () => {
      const cases = buildBenchmarkCatalog();
      const socialFormat = cases.find(
        (c) => c.service === "social" && c.format === "feed-post",
      );
      expect(socialFormat).toBeDefined();
    });

    it("organizes suites by output kind", () => {
      const suites = buildBenchmarkSuites();
      expect(suites.some((s) => s.suiteId === "suite.website")).toBe(true);
      expect(suites.some((s) => s.suiteId === "suite.image")).toBe(true);
    });
  });

  describe("benchmark execution", () => {
    it("runs same benchmark input against multiple models with fixed brief", async () => {
      const store = new InMemoryBenchmarkPerformanceRecordStore();
      const benchmarkId = "bench.branding.logo-design";
      const bc = getBenchmarkCase(benchmarkId);
      expect(bc).toBeDefined();

      const executeModel = jest.fn(async ({ benchmarkCase }) => ({
        preview: fixedPreview,
        latencyMs: 1200,
        inputTokens: 100,
        outputTokens: 200,
        totalTokens: 300,
        estimatedCost: 0.01,
      }));

      const resultA = await runBenchmark(
        {
          benchmarkId,
          model: modelA,
          organizationId: "org_bench",
          knowledgeVersion: "kv_12",
          executeModel,
        },
        { recordStore: store },
      );

      const resultB = await runBenchmark(
        {
          benchmarkId,
          model: modelB,
          organizationId: "org_bench",
          knowledgeVersion: "kv_12",
          executeModel,
        },
        { recordStore: store },
      );

      expect(executeModel).toHaveBeenCalledTimes(2);
      expect(executeModel.mock.calls[0]![0].benchmarkCase.inputBrief).toBe(
        executeModel.mock.calls[1]![0].benchmarkCase.inputBrief,
      );

      expect(resultA.record.benchmarkId).toBe(benchmarkId);
      expect(resultB.record.benchmarkId).toBe(benchmarkId);
      expect(resultA.record.knowledgeVersion).toBe("kv_12");
      expect(resultB.record.knowledgeVersion).toBe("kv_12");
      expect(await store.count()).toBe(2);
    });

    it("reuses Step 2 validation engine (not a duplicate evaluator)", async () => {
      const store = new InMemoryBenchmarkPerformanceRecordStore();
      const validationSpy = jest.spyOn(
        require("../../../src/platform/os/evaluation/output-validation/output-contract-validation-engine"),
        "validateOutputContract",
      );

      await runBenchmark(
        {
          benchmarkId: "bench.branding.logo-design",
          model: modelA,
          organizationId: "org_bench",
          executeModel: async () => ({
            preview: fixedPreview,
            latencyMs: 500,
          }),
        },
        { recordStore: store },
      );

      expect(validationSpy).toHaveBeenCalled();
      validationSpy.mockRestore();
    });
  });

  describe("model performance record", () => {
    it("separates hard requirement performance from quality performance", async () => {
      const store = new InMemoryBenchmarkPerformanceRecordStore();
      const { record } = await runBenchmark(
        {
          benchmarkId: "bench.branding.logo-design",
          model: modelA,
          organizationId: "org_bench",
          executeModel: async () => ({
            preview: fixedPreview,
            latencyMs: 800,
            mediaArtifactIds: ["media_1"],
          }),
        },
        { recordStore: store },
      );

      expect(typeof record.hardRequirementPassRate).toBe("number");
      expect(typeof record.qualityScore).toBe("number");
      expect(record.hardRequirementsTotal).toBeGreaterThan(0);
      expect(record.measuredQualityDimensions.length + record.unmeasuredQualityDimensions.length).toBeGreaterThan(0);
    });

    it("preserves version traceability in provenance", async () => {
      const store = new InMemoryBenchmarkPerformanceRecordStore();
      const { record } = await runBenchmark(
        {
          benchmarkId: "bench.branding.logo-design",
          model: modelA,
          organizationId: "org_bench",
          strategy: DEFAULT_BENCHMARK_STRATEGY,
          knowledgeVersion: "kv_15",
          executeModel: async () => ({ preview: fixedPreview, latencyMs: 400 }),
        },
        { recordStore: store },
      );

      expect(record.contractVersion).toBeTruthy();
      expect(record.strategyVersion).toBe(DEFAULT_BENCHMARK_STRATEGY.version);
      expect(record.evaluatorVersion).toBeTruthy();
      expect(record.knowledgeVersion).toBe("kv_15");
      expect(record.modelVersion).toBe(modelA.modelVersion);
      expect(record.provenance.some((p) => p.field === "evaluatorVersion")).toBe(true);
    });

    it("records operational failures separately from quality failures", async () => {
      const validation = validateOutputContract({
        organizationId: "org_1",
        executionId: "exec_op",
        service: "branding",
        subtype: "logo-design",
        preview: fixedPreview,
        mediaArtifactIds: ["m1"],
      })!;

      const record = buildModelPerformanceRecord({
        benchmarkCase: getBenchmarkCase("bench.branding.logo-design")!,
        validation,
        model: modelA,
        strategy: DEFAULT_BENCHMARK_STRATEGY,
        executionId: "exec_op",
        organizationId: "org_1",
        executionOutput: {
          preview: fixedPreview,
          latencyMs: 0,
          operationalFailure: { category: "timeout", message: "timed out" },
        },
        createId: (p) => `${p}_1`,
        nowIso: () => "2026-01-01T00:00:00.000Z",
      });

      expect(record.reliabilityStatus).toBe("operational_failure");
      expect(record.operationalFailureCategory).toBe("timeout");
    });

    it("marks unavailable cost explicitly", async () => {
      const store = new InMemoryBenchmarkPerformanceRecordStore();
      const { record } = await runBenchmark(
        {
          benchmarkId: "bench.branding.logo-design",
          model: modelA,
          organizationId: "org_bench",
          executeModel: async () => ({ preview: fixedPreview, latencyMs: 300 }),
        },
        { recordStore: store },
      );
      expect(record.costAvailable).toBe(false);
      expect(record.estimatedCost).toBeUndefined();
    });
  });

  describe("confidence and aggregation", () => {
    it("marks insufficient evidence for low sample counts", () => {
      const confidence = computePerformanceConfidence({ sampleCount: 2 });
      expect(confidence.level).toBe("insufficient");
    });

    it("aggregates with sample counts preserved", async () => {
      const store = new InMemoryBenchmarkPerformanceRecordStore();
      const executeModel = async () => ({
        preview: fixedPreview,
        latencyMs: 500,
        mediaArtifactIds: ["m1"],
      });

      for (let i = 0; i < 5; i++) {
        await runBenchmark(
          {
            benchmarkId: "bench.branding.logo-design",
            model: modelA,
            organizationId: "org_bench",
            executeModel,
          },
          { recordStore: store },
        );
      }

      const records = await store.query({ providerId: "openai" });
      const fps = aggregateRecordsInMemory(records, 2);
      expect(fps[0]!.sampleCount).toBe(5);
      expect(fps[0]!.confidence.sampleCount).toBe(5);
    });
  });

  describe("fair comparison", () => {
    it("detects incompatible benchmark conditions", async () => {
      const store = new InMemoryBenchmarkPerformanceRecordStore();
      const r1 = await runBenchmark(
        {
          benchmarkId: "bench.branding.logo-design",
          model: modelA,
          organizationId: "org_bench",
          knowledgeVersion: "kv_1",
          executeModel: async () => ({ preview: fixedPreview, latencyMs: 100 }),
        },
        { recordStore: store },
      );
      const r2 = await runBenchmark(
        {
          benchmarkId: "bench.branding.logo-design",
          model: modelB,
          organizationId: "org_bench",
          knowledgeVersion: "kv_2",
          executeModel: async () => ({ preview: fixedPreview, latencyMs: 100 }),
        },
        { recordStore: store },
      );

      const compat = checkComparisonCompatibility(r1.record, r2.record);
      expect(compat.compatible).toBe(false);
      expect(compat.reasons.some((r) => r.includes("knowledgeVersion"))).toBe(true);
    });
  });

  describe("regression detection", () => {
    it("flags per-industry regressions vs baseline", async () => {
      const store = new InMemoryBenchmarkPerformanceRecordStore();
      const makeRecord = (model: BenchmarkModelTarget, qualityScore: number, industry?: string) =>
        buildModelPerformanceRecord({
          benchmarkCase: {
            ...getBenchmarkCase("bench.website.landing-page")!,
            industry,
          },
          validation: {
            ...validateOutputContract({
              organizationId: "org",
              executionId: `exec_${Math.random()}`,
              service: "website",
              subtype: "landing-page",
              preview: "landing page content",
              industry,
            })!,
            overallScore: qualityScore,
          },
          model,
          strategy: DEFAULT_BENCHMARK_STRATEGY,
          executionId: `exec_${Math.random()}`,
          organizationId: "org",
          executionOutput: { preview: "x", latencyMs: 100 },
          createId: (p) => `${p}_${Math.random()}`,
          nowIso: () => new Date().toISOString(),
        });

      const baselineRecords = [
        makeRecord(modelA, 92, "fashion"),
        makeRecord(modelA, 91, "healthcare"),
      ];
      const candidateRecords = [
        makeRecord(modelB, 94, "fashion"),
        makeRecord(modelB, 78, "healthcare"),
      ];

      for (const r of [...baselineRecords, ...candidateRecords]) {
        await store.append(r);
      }

      const report = detectRegressions({
        baselineRecords,
        candidateRecords,
        regressionThreshold: 5,
      });

      expect(report.hasRegressions).toBe(true);
      const healthcareRegression = report.findings.find(
        (f) => f.scope.includes("healthcare") && f.metric === "qualityScore" && f.isRegression,
      );
      expect(healthcareRegression).toBeDefined();
    });
  });

  describe("performance evidence bridge", () => {
    it("persists to existing IModelPerformanceStore with benchmark method", async () => {
      const perfStore = new InMemoryModelPerformanceStore();
      const store = new InMemoryBenchmarkPerformanceRecordStore();
      const { record } = await runBenchmark(
        {
          benchmarkId: "bench.branding.logo-design",
          model: modelA,
          organizationId: "org_bench",
          executeModel: async () => ({
            preview: fixedPreview,
            latencyMs: 600,
            estimatedCost: 0.02,
          }),
        },
        { recordStore: store, performanceStore: perfStore },
      );

      await persistBenchmarkToPerformanceStore(perfStore, record);
      const evidence = await perfStore.getByAttemptId(record.attemptId!);
      expect(evidence?.evaluationMethod).toBe("benchmark");
      expect(evidence?.exploratory).toBe(true);
    });
  });

  describe("production routing unchanged", () => {
    it("adaptive routing remains disabled by default", () => {
      const config = loadAdaptiveRoutingConfig({});
      expect(config.adaptiveRoutingEnabled).toBe(false);
    });

    it("blendScore returns static scores unchanged", async () => {
      const intel = new EvidenceOnlyPerformanceIntelligence();
      const blended = await intel.blendScore({
        staticTotal: 0.85,
        staticQuality: 0.9,
        staticLatency: 0.8,
        staticCost: 0.7,
        staticHealth: 1,
        strategy: "QUALITY",
        key: {
          providerId: "openai",
          modelId: "gpt-4o",
          capabilityId: "text.generation",
        },
      });
      expect(blended.total).toBe(0.85);
      expect(blended.explain.usedAdaptiveFeedback).toBe(false);
      expect(blended.explain.coldStart).toBe(true);
    });
  });

  describe("coverage audit", () => {
    it("reports full service/output matrix with zero unsupported", () => {
      const report = auditBenchmarkCoverage();
      expect(report.unsupported).toBe(0);
      expect(report.benchmarkable).toBeGreaterThan(0);
      expect(report.totalEntries).toBeGreaterThan(90);
    });

    it("assertFullBenchmarkCoverage passes", () => {
      expect(() => assertFullBenchmarkCoverage()).not.toThrow();
    });
  });

  describe("benchmark suite execution", () => {
    it("runs benchmark suite across models", async () => {
      const store = new InMemoryBenchmarkPerformanceRecordStore();
      const results = await runBenchmarkSuite(
        {
          suiteId: "suite.general",
          models: [modelA],
          organizationId: "org_bench",
          executeModel: async () => ({ preview: fixedPreview, latencyMs: 200 }),
        },
        { recordStore: store },
      );
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("validation lifecycle", () => {
    it("successful execution produces validation and validationAvailable=true", async () => {
      const store = new InMemoryBenchmarkPerformanceRecordStore();
      const result = await runBenchmark(
        {
          benchmarkId: "bench.branding.logo-design",
          model: modelA,
          organizationId: "org_bench",
          executeModel: async () => ({
            preview: fixedPreview,
            latencyMs: 400,
            mediaArtifactIds: ["m1"],
          }),
        },
        { recordStore: store },
      );

      expect(result.validationAvailable).toBe(true);
      expect(result.record.hardRequirementsTotal).toBeGreaterThan(0);
      expect(result.record.validationStatus).not.toBe("BLOCKED");
    });

    it("operational failure still validates output when contract is composable", async () => {
      const store = new InMemoryBenchmarkPerformanceRecordStore();
      const result = await runBenchmark(
        {
          benchmarkId: "bench.branding.logo-design",
          model: modelA,
          organizationId: "org_bench",
          executeModel: async () => ({
            preview: "",
            latencyMs: 100,
            operationalFailure: { category: "timeout", message: "timed out" },
          }),
        },
        { recordStore: store },
      );

      expect(result.validationAvailable).toBe(true);
      expect(result.record.reliabilityStatus).toBe("operational_failure");
      expect(result.record.hardRequirementsTotal).toBeGreaterThan(0);
    });

    it("operational failure without composable validation uses operational record path", async () => {
      const validationSpy = jest
        .spyOn(
          require("../../../src/platform/os/evaluation/output-validation/output-contract-validation-engine"),
          "validateOutputContract",
        )
        .mockReturnValue(undefined);

      const store = new InMemoryBenchmarkPerformanceRecordStore();
      const result = await runBenchmark(
        {
          benchmarkId: "bench.branding.logo-design",
          model: modelA,
          organizationId: "org_bench",
          executeModel: async () => ({
            preview: "",
            latencyMs: 50,
            operationalFailure: { category: "rate_limit", message: "rate limited" },
          }),
        },
        { recordStore: store },
      );

      expect(result.validationAvailable).toBe(false);
      expect(result.record.reliabilityStatus).toBe("operational_failure");
      expect(result.record.hardRequirementsTotal).toBe(0);
      expect(result.record.validationStatus).toBe("BLOCKED");
      expect(result.record.operationalFailureCategory).toBe("rate_limit");
      validationSpy.mockRestore();
    });

    it("throws when validation unavailable without operational failure", async () => {
      const validationSpy = jest
        .spyOn(
          require("../../../src/platform/os/evaluation/output-validation/output-contract-validation-engine"),
          "validateOutputContract",
        )
        .mockReturnValue(undefined);

      const store = new InMemoryBenchmarkPerformanceRecordStore();
      await expect(
        runBenchmark(
          {
            benchmarkId: "bench.branding.logo-design",
            model: modelA,
            organizationId: "org_bench",
            executeModel: async () => ({
              preview: fixedPreview,
              latencyMs: 100,
            }),
          },
          { recordStore: store },
        ),
      ).rejects.toThrow(/validation unavailable/i);

      validationSpy.mockRestore();
    });
  });

  describe("NOT_AUTOMATED dimensions", () => {
    it("preserves unmeasured quality dimensions without fake perfect scores", async () => {
      const store = new InMemoryBenchmarkPerformanceRecordStore();
      const { record } = await runBenchmark(
        {
          benchmarkId: "bench.branding.logo-design",
          model: modelA,
          organizationId: "org_bench",
          executeModel: async () => ({
            preview: fixedPreview,
            latencyMs: 400,
            mediaArtifactIds: ["m1"],
          }),
        },
        { recordStore: store },
      );
      expect(record.unmeasuredQualityDimensions.length).toBeGreaterThan(0);
    });
  });
});
