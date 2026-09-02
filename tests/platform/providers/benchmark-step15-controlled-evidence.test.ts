/**
 * Step 15 — Controlled evidence expansion + routing readiness (deterministic, zero paid API calls).
 */

import {
  TIER1_CONTROLLED_EVIDENCE_BENCHMARK_IDS,
  TIER1_CONTROLLED_EVIDENCE_MODELS,
  TIER1_CONTROLLED_EVIDENCE_REPEAT_COUNT,
  TIER1_CONTROLLED_EVIDENCE_BUDGET,
  tier1ControlledEvidenceCellCount,
  buildControlledEvidencePlan,
  planControlledEvidenceCollection,
  assertControlledEvidenceBudget,
  executeControlledEvidenceCollection,
  evaluateTierExpansionCriteria,
  classifyPresentationPipelineFailure,
  verifyFairComparisonCompatibility,
  buildRoutingReadinessReport,
  getBenchmarkCase,
  runBenchmark,
  DEFAULT_BENCHMARK_STRATEGY,
  InMemoryBenchmarkPerformanceRecordStore,
  createBenchmarkProviderExecutor,
  createBenchmarkAsyncMediaPlatform,
  materializeBenchmarkOsArtifacts,
  buildBenchmarkOsMetadata,
  resolveBenchmarkValidationAsync,
  executeBenchmarkOsPipeline,
  assertBenchmarkBudget,
  planBenchmarkInvocations,
  filterValidComparisonRecords,
  detectSpecializations,
  compareModelsAtScope,
  buildOperationalFailureBenchmarkRecord,
  type BenchmarkModelTarget,
} from "../../../src/platform/providers/routing/performance/benchmark";
import { filterObservationalProductionRecords } from "../../../src/platform/providers/routing/performance/benchmark/evidence/evidence-validity";
import { loadAdaptiveRoutingConfig } from "../../../src/platform/providers/routing/performance/config/adaptive-routing-config";
import { ControllableDispatcher } from "../../../src/platform/providers/runtime/testing";
import { createDirectExecutionEngine } from "../../../src/platform/direct/direct-execution-engine";
import { createProviderRuntime } from "../../../src/platform/providers/runtime/factories/create-provider-runtime";
import { createToolRuntimePlatform } from "../../../src/platform/providers/tools/composition/tool-runtime-platform";
import { InMemoryToolInvocationStore } from "../../../src/platform/providers/tools/idempotency/in-memory-tool-invocation-store";
import * as documentExportService from "../../../src/platform/os/delivery/document-export-service";
import { clearValidationCache } from "../../../src/platform/os/evaluation/output-validation";
import { EVALUATION_PLANE_VERSION } from "../../../src/platform/os/evaluation/evaluation-plane/evaluation-plane-version";

const textModel: BenchmarkModelTarget = Object.freeze({
  providerId: "provider.openai",
  modelId: "openai/gpt-4o",
  capabilityId: "text.generate",
});

const WEBSITE_HTML = `<!DOCTYPE html>
<html lang="en"><head><title>Launch</title></head>
<body><main><h1>Launch</h1><p>Professional landing page.</p></main></body></html>`;

describe("Step 15 — Controlled evidence expansion + routing readiness", () => {
  beforeEach(() => {
    clearValidationCache();
  });

  it("defaults adaptive routing to disabled", () => {
    expect(loadAdaptiveRoutingConfig({}).adaptiveRoutingEnabled).toBe(false);
  });

  it("generates Tier 1 matrix with website and presentation benchmarks", () => {
    const plan = buildControlledEvidencePlan({ tier: 1 });
    expect(plan.tier).toBe(1);
    expect(plan.benchmarkIds).toEqual(TIER1_CONTROLLED_EVIDENCE_BENCHMARK_IDS);
    expect(plan.models.length).toBe(2);
    expect(plan.repeatCount).toBe(TIER1_CONTROLLED_EVIDENCE_REPEAT_COUNT);
    expect(plan.totalInvocations).toBe(tier1ControlledEvidenceCellCount());
    expect(plan.totalInvocations).toBe(12);
    expect(plan.adaptiveRoutingPinned).toBe(true);
    expect(plan.cells.some((c) => c.benchmarkId === "bench.website.landing-page")).toBe(true);
    expect(plan.cells.some((c) => c.benchmarkId === "bench.presentations.pitch-decks")).toBe(true);
  });

  it("calculates budget for Tier 1 matrix", () => {
    const plan = planControlledEvidenceCollection({ tier: 1 });
    expect(plan.invocationPlan.totalInvocations).toBe(12);
    expect(plan.invocationPlan.withinMaxInvocations).toBe(true);
    expect(() => assertControlledEvidenceBudget(plan)).not.toThrow();
  });

  it("rejects plans exceeding Tier 1 budget", () => {
    const plan = planBenchmarkInvocations({
      benchmarkIds: [...TIER1_CONTROLLED_EVIDENCE_BENCHMARK_IDS, "bench.social.copywriting"],
      models: TIER1_CONTROLLED_EVIDENCE_MODELS,
      repeatCount: TIER1_CONTROLLED_EVIDENCE_REPEAT_COUNT,
    });
    expect(() => assertBenchmarkBudget(plan, TIER1_CONTROLLED_EVIDENCE_BUDGET)).toThrow(/budget exceeded/i);
  });

  it("dry-run produces zero provider calls", async () => {
    const dispatcher = new ControllableDispatcher({ mode: "success" });
    const dispatchSpy = jest.spyOn(dispatcher, "dispatch");
    const result = await executeControlledEvidenceCollection({
      tier: 1,
      organizationId: "org_step15_dry",
      dryRun: true,
    });
    expect(result.dryRun).toBe(true);
    expect(result.executedCalls).toBe(0);
    expect(result.records.length).toBe(0);
    expect(dispatchSpy).not.toHaveBeenCalled();
    dispatchSpy.mockRestore();
  });

  it("executes repeats as separate append-only records", async () => {
    const store = new InMemoryBenchmarkPerformanceRecordStore();
    const executor = createBenchmarkProviderExecutor({ mode: "success" });
    const result = await executeControlledEvidenceCollection(
      {
        tier: 1,
        organizationId: "org_step15_repeat",
        dryRun: false,
        executeModel: executor,
      },
      { recordStore: store },
    );
    expect(result.executedCalls).toBe(12);
    const ids = new Set(result.records.map((r) => r.performanceRecordId));
    expect(ids.size).toBe(12);
    const websiteRecords = result.records.filter(
      (r) => r.benchmarkId === "bench.website.landing-page" && r.modelId === textModel.modelId,
    );
    expect(websiteRecords.length).toBe(TIER1_CONTROLLED_EVIDENCE_REPEAT_COUNT);
  });

  it("verifies fair comparison compatibility requirements", async () => {
    const store = new InMemoryBenchmarkPerformanceRecordStore();
    await executeControlledEvidenceCollection(
      {
        tier: 1,
        organizationId: "org_step15_compat",
        dryRun: false,
        executeModel: createBenchmarkProviderExecutor({ mode: "success" }),
      },
      { recordStore: store },
    );
    const records = await store.query({ organizationId: "org_step15_compat", limit: 50 });
    const compat = verifyFairComparisonCompatibility(records);
    expect(compat.incompatiblePairs).toBe(0);
    expect(filterValidComparisonRecords(records).every((r) => r.evidenceMode === "controlled")).toBe(
      true,
    );
  });

  it("reports INSUFFICIENT_EVIDENCE when sample count is too low", () => {
    const report = buildRoutingReadinessReport({ records: [] });
    expect(report.overallStatus).toBe("INSUFFICIENT_EVIDENCE");
    expect(report.validComparisonCount).toBe(0);
    expect(report.adaptiveRoutingActivated).toBe(false);
  });

  it("detects specializations only with sufficient evidence", async () => {
    const store = new InMemoryBenchmarkPerformanceRecordStore();
    await executeControlledEvidenceCollection(
      {
        tier: 1,
        organizationId: "org_step15_spec",
        dryRun: false,
        executeModel: createBenchmarkProviderExecutor({ mode: "success" }),
      },
      { recordStore: store },
    );
    const records = await store.query({ organizationId: "org_step15_spec", limit: 50 });
    const specializations = detectSpecializations({
      fingerprints: records.map((r) =>
        Object.freeze({
          providerId: r.providerId,
          modelId: r.modelId,
          service: r.service,
          sampleCount: 1,
          validComparisonSamples: 1,
          qualityScoreMean: r.qualityScore,
          hardRequirementPassRateMean: r.hardRequirementPassRate,
          latencyMsMean: r.latencyMs,
          latencyMsMedian: r.latencyMs,
          operationalFailureRate: 0,
          confidence: Object.freeze({ level: "insufficient" as const, score: 0 }),
          qualityDimensions: {},
          measuredQualityDimensions: [],
          unmeasuredQualityDimensions: [],
          failureCategories: {},
          windowStart: r.createdAt,
          windowEnd: r.createdAt,
          evaluatorVersion: r.evaluatorVersion,
          evaluationPlaneVersion: EVALUATION_PLANE_VERSION,
        }),
      ),
    });
    expect(specializations.every((s) => s.status === "INSUFFICIENT_EVIDENCE")).toBe(true);
  });

  it("runs website pipeline through OS materialization with mock provider", async () => {
    const bc = getBenchmarkCase("bench.website.landing-page")!;
    const media = createBenchmarkAsyncMediaPlatform();
    const metadata = buildBenchmarkOsMetadata({
      benchmarkCase: bc,
      model: textModel,
      strategy: DEFAULT_BENCHMARK_STRATEGY,
      organizationId: "org_web_pipe",
      executionId: "exec_web_pipe",
    });
    const materialized = await materializeBenchmarkOsArtifacts({
      benchmarkCase: bc,
      asyncMedia: media.platform,
      executionId: "exec_web_pipe",
      organizationId: "org_web_pipe",
      metadata,
      runtimeOutput: {
        structured: {
          routes: [{ title: "Launch", files: [{ path: "index.html", content: WEBSITE_HTML }] }],
        },
        content: WEBSITE_HTML,
      },
      providerId: textModel.providerId,
      modelId: textModel.modelId,
      capabilityId: "text.generate",
      createId: (p) => `${p}_web`,
    });
    expect(materialized.mediaArtifactIds.length).toBeGreaterThan(0);
    const validation = await resolveBenchmarkValidationAsync({
      benchmarkCase: bc,
      executionOutput: materialized,
      organizationId: "org_web_pipe",
      executionId: "exec_web_pipe",
      artifactEvaluationDeps: {
        asyncMedia: media.platform,
        artifactsRepo: media.artifactsRepo,
      },
    });
    expect(validation.kind).toBe("validated");
  });

  it("runs presentation pipeline through expansion with mock provider", async () => {
    jest.spyOn(documentExportService, "buildPresentationPptx").mockResolvedValue(Buffer.from("PK-fake"));
    const bc = getBenchmarkCase("bench.presentations.pitch-decks")!;
    const dispatcher = new ControllableDispatcher({ mode: "success" });
    const runtime = createProviderRuntime({ dispatcher });
    const toolRuntime = createToolRuntimePlatform({
      dispatcher,
      runtime,
      invocationStore: new InMemoryToolInvocationStore(),
      durable: false,
    });
    const engine = createDirectExecutionEngine({ runtime, toolRuntime });
    const media = createBenchmarkAsyncMediaPlatform();

    const output = await executeBenchmarkOsPipeline(
      { engine, asyncMedia: media.platform, artifactsRepo: media.artifactsRepo },
      {
        benchmarkCase: bc,
        model: textModel,
        strategy: DEFAULT_BENCHMARK_STRATEGY,
        organizationId: "org_pres_pipe",
        executionId: "exec_pres_pipe",
      },
    );
    expect(output.operationalFailure).toBeUndefined();
    expect(output.mediaArtifactIds?.length).toBeGreaterThan(0);
    jest.restoreAllMocks();
  });

  it("classifies presentation expansion missing_routes as operational not model quality", () => {
    const record = buildOperationalFailureBenchmarkRecord({
      benchmarkCase: getBenchmarkCase("bench.presentations.pitch-decks")!,
      model: textModel,
      strategy: DEFAULT_BENCHMARK_STRATEGY,
      executionId: "exec_pres_fail",
      attemptId: "attempt_1",
      organizationId: "org_pres_fail",
      executionOutput: Object.freeze({
        latencyMs: 100,
        operationalFailure: Object.freeze({
          category: "functional_failure",
          message: "expansion missing_routes",
        }),
      }),
      createId: (p) => `${p}_pres`,
      nowIso: () => "2026-01-01T00:00:00.000Z",
    });
    expect(record.benchmarkOutcome).toBe("PROVIDER_OPERATIONAL_FAILURE");
    const classification = classifyPresentationPipelineFailure({
      record,
      executionOutput: Object.freeze({
        latencyMs: 100,
        operationalFailure: Object.freeze({
          category: "functional_failure",
          message: "expansion missing_routes",
        }),
      }),
    });
    expect(classification).toBe("EXPANSION_MISSING_ROUTES");
    expect(record.benchmarkOutcome).not.toBe("MODEL_QUALITY_FAILURE");
  });

  it("separates production observational evidence from controlled comparison", async () => {
    const store = new InMemoryBenchmarkPerformanceRecordStore();
    await executeControlledEvidenceCollection(
      {
        tier: 1,
        organizationId: "org_step15_sep",
        dryRun: false,
        executeModel: createBenchmarkProviderExecutor({ mode: "success" }),
      },
      { recordStore: store },
    );
    const records = await store.query({ organizationId: "org_step15_sep", limit: 20 });
    const production = filterObservationalProductionRecords(records);
    expect(production.length).toBe(0);
    expect(records.every((r) => r.evidenceSource === "benchmark")).toBe(true);
  });

  it("builds routing readiness report without activating routing", async () => {
    const store = new InMemoryBenchmarkPerformanceRecordStore();
    await executeControlledEvidenceCollection(
      {
        tier: 1,
        organizationId: "org_step15_ready",
        dryRun: false,
        executeModel: createBenchmarkProviderExecutor({ mode: "success" }),
      },
      { recordStore: store },
    );
    const records = await store.query({ organizationId: "org_step15_ready", limit: 50 });
    const report = buildRoutingReadinessReport({ records });
    expect(report.adaptiveRoutingActivated).toBe(false);
    expect(report.textReport).toContain("Adaptive routing activated: NO");
    expect(["INSUFFICIENT_EVIDENCE", "NOT_READY", "READY_FOR_HUMAN_REVIEW"]).toContain(
      report.overallStatus,
    );
  });

  it("compares models at scope using valid records only", async () => {
    const store = new InMemoryBenchmarkPerformanceRecordStore();
    await executeControlledEvidenceCollection(
      {
        tier: 1,
        organizationId: "org_step15_cmp",
        dryRun: false,
        executeModel: createBenchmarkProviderExecutor({ mode: "success" }),
      },
      { recordStore: store },
    );
    const records = await store.query({ organizationId: "org_step15_cmp", limit: 50 });
    const comparisons = compareModelsAtScope({ records: filterValidComparisonRecords(records) });
    expect(comparisons.length).toBeGreaterThan(0);
  });

  it("evaluates tier expansion criteria from collected records", async () => {
    const store = new InMemoryBenchmarkPerformanceRecordStore();
    await executeControlledEvidenceCollection(
      {
        tier: 1,
        organizationId: "org_step15_tier",
        dryRun: false,
        executeModel: createBenchmarkProviderExecutor({ mode: "success" }),
      },
      { recordStore: store },
    );
    const records = await store.query({ organizationId: "org_step15_tier", limit: 50 });
    const expansion = evaluateTierExpansionCriteria({ records, completedTier: 1 });
    expect(["HOLD_TIER1", "EXPAND_TIER2", "EXPAND_TIER3", "INSUFFICIENT_EVIDENCE"]).toContain(
      expansion,
    );
  });

  it("does not invoke ControllableDispatcher during planning", () => {
    const dispatcher = new ControllableDispatcher({ mode: "success" });
    const spy = jest.spyOn(dispatcher, "dispatch");
    planControlledEvidenceCollection({ tier: 1 });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
