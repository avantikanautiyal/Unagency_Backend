import {
  checkBenchmarkCompatibility,
  resolveBenchmarkValidity,
  resolveBenchmarkOutcome,
  explainBenchmarkCost,
  classifyBenchmarkComparability,
  buildCalibrationRunPlan,
  CALIBRATION_DEFAULT_BENCHMARK_IDS,
  BENCHMARK_EXECUTOR_PROFILE,
  checkComparisonCompatibility,
  getBenchmarkCase,
  createBenchmarkProviderExecutor,
  runBenchmark,
  InMemoryBenchmarkPerformanceRecordStore,
  DEFAULT_BENCHMARK_STRATEGY,
  type BenchmarkModelTarget,
} from "../../../src/platform/providers/routing/performance/benchmark";
import { ControllableDispatcher } from "../../../src/platform/providers/runtime/testing";
import { createModelRegistryPlatform } from "../../../src/platform/model-registry/factories/create-model-registry-platform";
import { DefaultCompatibilityEngine } from "../../../src/platform/model-registry/compatibility/default-compatibility-engine";
import { loadAdaptiveRoutingConfig } from "../../../src/platform/providers/routing/performance/config/adaptive-routing-config";

describe("Step 4B — Benchmark Calibration", () => {
  const textModel: BenchmarkModelTarget = Object.freeze({
    providerId: "provider.openai",
    modelId: "openai/gpt-4o",
    capabilityId: "text.generate",
  });

  const imageModel: BenchmarkModelTarget = Object.freeze({
    providerId: "provider.openai",
    modelId: "openai/gpt-image-1",
    capabilityId: "image.generate",
  });

  describe("benchmark validity model", () => {
    it("documents deferred_website as execution-pipeline benchmark, not pure model test", () => {
      const bc = getBenchmarkCase("bench.website.landing-page")!;
      const validity = resolveBenchmarkValidity(bc);
      expect(validity.requiredCapabilityId).toBe("text.generate");
      expect(validity.requiresStructuredOutput).toBe(true);
      expect(validity.validForPureModelComparison).toBe(false);
      expect(validity.requiredExecutionInterfaces).toContain("artifact_creation");
      expect(validity.architectureNote).toContain("website-generation");
    });

    it("documents presentation benchmark execution gap", () => {
      const bc = getBenchmarkCase("bench.presentations.pitch-decks")!;
      const validity = resolveBenchmarkValidity(bc);
      expect(validity.validForPureModelComparison).toBe(false);
      expect(validity.expectedOutputForm).toContain("PresentationRoutes");
    });

    it("marks social copywriting as valid text model comparison", () => {
      const bc = getBenchmarkCase("bench.social.copywriting")!;
      const validity = resolveBenchmarkValidity(bc);
      expect(validity.validForPureModelComparison).toBe(true);
      expect(validity.intent).toBe("control_text");
    });

    it("requires image.generate for logo-design benchmark", () => {
      const bc = getBenchmarkCase("bench.branding.logo-design")!;
      const validity = resolveBenchmarkValidity(bc);
      expect(validity.requiredCapabilityId).toBe("image.generate");
      expect(validity.validForPureModelComparison).toBe(false);
    });
  });

  describe("execution capability compatibility", () => {
    it("pre-flights website benchmark as EXECUTION_CAPABILITY_UNAVAILABLE", () => {
      const bc = getBenchmarkCase("bench.website.landing-page")!;
      const verdict = checkBenchmarkCompatibility({
        benchmarkCase: bc,
        modelId: textModel.modelId,
      });
      expect(verdict.skipExecution).toBe(true);
      expect(verdict.outcomeIfSkipped).toBe("EXECUTION_CAPABILITY_UNAVAILABLE");
      expect(verdict.executionCapabilityAvailable).toBe(false);
      expect(verdict.validForModelComparison).toBe(false);
    });

    it("pre-flights image benchmark with text model as MODEL_CAPABILITY_UNSUPPORTED", () => {
      const registryPlatform = createModelRegistryPlatform({ loadSeed: true });
      const bc = getBenchmarkCase("bench.branding.logo-design")!;
      const verdict = checkBenchmarkCompatibility({
        benchmarkCase: bc,
        modelId: textModel.modelId,
        modelRegistry: registryPlatform.registry,
        compatibilityEngine: new DefaultCompatibilityEngine(),
      });
      expect(verdict.skipExecution).toBe(true);
      expect(verdict.outcomeIfSkipped).toBe("MODEL_CAPABILITY_UNSUPPORTED");
    });

    it("allows social copywriting text benchmark to execute", () => {
      const bc = getBenchmarkCase("bench.social.copywriting")!;
      const verdict = checkBenchmarkCompatibility({
        benchmarkCase: bc,
        modelId: textModel.modelId,
      });
      expect(verdict.skipExecution).toBe(false);
      expect(verdict.validForModelComparison).toBe(true);
    });

    it("executor skips website benchmark without dispatch", async () => {
      const dispatcher = new ControllableDispatcher({ mode: "success" });
      const dispatchSpy = jest.spyOn(dispatcher, "dispatch");
      const executor = createBenchmarkProviderExecutor({ dispatcher });
      const bc = getBenchmarkCase("bench.website.landing-page")!;

      const output = await executor({
        benchmarkCase: bc,
        model: textModel,
        strategy: DEFAULT_BENCHMARK_STRATEGY,
        organizationId: "org_cal",
        executionId: "exec_skip",
      });

      expect(dispatchSpy).not.toHaveBeenCalled();
      expect(output.skippedPreFlight).toBe(true);
      expect(output.compatibility?.outcomeIfSkipped).toBe("EXECUTION_CAPABILITY_UNAVAILABLE");
      dispatchSpy.mockRestore();
    });
  });

  describe("outcome taxonomy", () => {
    it("classifies contract mismatch separately from model quality on website runs", () => {
      const bc = getBenchmarkCase("bench.website.landing-page")!;
      const compat = checkBenchmarkCompatibility({ benchmarkCase: bc, modelId: textModel.modelId });
      const outcome = resolveBenchmarkOutcome({
        compatibility: compat,
        validation: {
          status: "BLOCKED",
          completionAllowed: false,
          overallScore: 41,
          contractId: "c1",
          contractVersion: "1.0.0",
          hardRequirementSummary: {
            total: 12,
            passed: 3,
            failed: 9,
            unverified: 0,
            criticalFailed: 1,
          },
          requirements: [],
          qualityDimensions: [],
          failureSummary: {
            failures: [{ failureCategory: "invalid_output_format", count: 1 }],
          },
        } as never,
      });
      expect(outcome).toBe("CONTRACT_FAILURE");
    });

    it("does not treat execution skip as model quality failure", () => {
      const bc = getBenchmarkCase("bench.website.landing-page")!;
      const compat = checkBenchmarkCompatibility({ benchmarkCase: bc, modelId: textModel.modelId });
      const outcome = resolveBenchmarkOutcome({
        compatibility: compat,
        skippedPreFlight: true,
      });
      expect(outcome).toBe("EXECUTION_CAPABILITY_UNAVAILABLE");
    });
  });

  describe("cost accounting", () => {
    it("explains high cost from output token volume using registry pricing", () => {
      const registryPlatform = createModelRegistryPlatform({ loadSeed: true });
      const model = registryPlatform.registry.getModel("anthropic/claude-sonnet-4-5");
      expect(model.ok).toBe(true);
      const breakdown = explainBenchmarkCost({
        model: model.value,
        inputTokens: 500,
        outputTokens: 4000,
      });
      expect(breakdown.totalCostUsd).toBeCloseTo(61.5, 0);
      expect(breakdown.outputCostUsd).toBeGreaterThan(breakdown.inputCostUsd);
    });
  });

  describe("fair comparison", () => {
    it("marks incompatible when benchmark outcomes differ in comparability", () => {
      const base = {
        benchmarkId: "bench.social.copywriting",
        benchmarkVersion: "1.0.0",
        contractVersion: "1.0.0",
        strategyVersion: "1.0.0",
        evaluatorVersion: "step2.1",
        requiredCapabilityId: "text.generate",
        executionProfileVersion: "1.0.0",
        validForModelComparison: true,
        benchmarkOutcome: "MODEL_SUCCESS" as const,
      };
      const compat = checkComparisonCompatibility(
        base as never,
        { ...base, benchmarkOutcome: "EXECUTION_CAPABILITY_UNAVAILABLE" } as never,
      );
      expect(compat.compatible).toBe(false);
      expect(compat.reasons.some((r) => r.includes("benchmarkOutcome"))).toBe(true);
    });
  });

  describe("calibration run plan", () => {
    it("plans executable copywriting and brochure cases with OS profile", () => {
      const ready = [
        Object.freeze({ providerId: "provider.openai", enabled: true, configured: true }),
        Object.freeze({ providerId: "provider.anthropic", enabled: true, configured: true }),
      ];
      const plan = buildCalibrationRunPlan({ readyProviders: ready });
      expect(plan.benchmarkIds).toEqual([...CALIBRATION_DEFAULT_BENCHMARK_IDS]);
      expect(plan.executableInvocations).toBe(plan.plan.totalInvocations);
      expect(plan.preFlightSkips.length).toBe(0);
    });

    it("classifies benchmark comparability via control catalog", () => {
      expect(classifyBenchmarkComparability("bench.website.landing-page").validForPureModelComparison).toBe(
        false,
      );
      expect(classifyBenchmarkComparability("bench.social.copywriting").validForPureModelComparison).toBe(
        true,
      );
    });
  });

  describe("record semantics", () => {
    it("creates pre-flight skipped record without validation", async () => {
      const store = new InMemoryBenchmarkPerformanceRecordStore();
      const dispatcher = new ControllableDispatcher({ mode: "success" });
      const executor = createBenchmarkProviderExecutor({ dispatcher });
      const bc = getBenchmarkCase("bench.website.landing-page")!;

      const { record } = await runBenchmark(
        {
          benchmarkId: bc.benchmarkId,
          model: textModel,
          organizationId: "org_cal",
          executeModel: executor,
        },
        { recordStore: store },
      );

      expect(record.benchmarkOutcome).toBe("EXECUTION_CAPABILITY_UNAVAILABLE");
      expect(record.validForModelComparison).toBe(false);
      expect(record.qualityScore).toBe(0);
      expect(record.qualityScoreInterpretation).toContain("not applicable");
    });
  });

  describe("production unchanged", () => {
    it("adaptive routing remains disabled", () => {
      expect(loadAdaptiveRoutingConfig({}).adaptiveRoutingEnabled).toBe(false);
    });

    it("benchmark executor profile remains text_prompt only", () => {
      expect(BENCHMARK_EXECUTOR_PROFILE.interfaces).toEqual(["text_prompt"]);
      expect(BENCHMARK_EXECUTOR_PROFILE.supportsArtifactCreation).toBe(false);
    });
  });
});
