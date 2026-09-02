/**
 * Step 5 — Execution capability completion through canonical OS pipeline.
 */

import {
  BENCHMARK_EXECUTOR_PROFILE,
  BENCHMARK_OS_EXECUTOR_PROFILE,
  buildBenchmarkOsMetadata,
  benchmarkCaseUsesOsArtifactPipeline,
  checkBenchmarkCompatibility,
  createBenchmarkAsyncMediaPlatform,
  createBenchmarkProviderExecutor,
  materializeBenchmarkOsArtifacts,
  resolveBenchmarkValidation,
  runBenchmark,
  getBenchmarkCase,
  DEFAULT_BENCHMARK_STRATEGY,
  InMemoryBenchmarkPerformanceRecordStore,
  type BenchmarkModelTarget,
} from "../../../src/platform/providers/routing/performance/benchmark";
import type { IDirectExecutionEngine } from "../../../src/platform/direct/contracts";
import { success } from "../../../src/platform/core/result";
import { ControllableDispatcher } from "../../../src/platform/providers/runtime/testing";
import { loadAdaptiveRoutingConfig } from "../../../src/platform/providers/routing/performance/config/adaptive-routing-config";

describe("Step 5 — Execution Capability Completion", () => {
  const textModel: BenchmarkModelTarget = Object.freeze({
    providerId: "provider.openai",
    modelId: "openai/gpt-4o",
    capabilityId: "text.generate",
  });

  const brochurePlan = {
    title: "Professional Multipage Brochure",
    summary:
      "A professional deliverable suitable for print or digital distribution meeting industry expectations.",
    sections: [
      {
        heading: "Overview",
        body: "Professional multipage brochure suitable for print or digital distribution.",
      },
      {
        heading: "Services",
        body: "Deliverable content aligned with standard industry expectations.",
      },
      {
        heading: "Proof",
        body: "Trusted professional brochure format for print and digital channels.",
      },
      {
        heading: "Contact",
        body: "Request your professional brochure deliverable today.",
      },
    ],
  };

  describe("OS execution profile", () => {
    it("provides structured output and artifact creation without duplicating text-only profile", () => {
      expect(BENCHMARK_OS_EXECUTOR_PROFILE.profileId).toBe("benchmark_os_executor");
      expect(BENCHMARK_OS_EXECUTOR_PROFILE.interfaces).toContain("structured_output_mode");
      expect(BENCHMARK_OS_EXECUTOR_PROFILE.interfaces).toContain("artifact_creation");
      expect(BENCHMARK_EXECUTOR_PROFILE.interfaces).toEqual(["text_prompt"]);
    });

    it("allows brochure benchmark with OS profile (runtime remains NOT_AUTOMATED)", () => {
      const bc = getBenchmarkCase("bench.print.brochures")!;
      const verdict = checkBenchmarkCompatibility({
        benchmarkCase: bc,
        modelId: textModel.modelId,
        executionProfile: BENCHMARK_OS_EXECUTOR_PROFILE,
      });
      expect(verdict.skipExecution).toBe(false);
      expect(verdict.executionCapabilityAvailable).toBe(true);
      expect(verdict.executionProfileId).toBe("benchmark_os_executor");
    });

    it("still pre-flights website without OS bridge on text-only executor", () => {
      const bc = getBenchmarkCase("bench.website.landing-page")!;
      const verdict = checkBenchmarkCompatibility({
        benchmarkCase: bc,
        modelId: textModel.modelId,
        executionProfile: BENCHMARK_EXECUTOR_PROFILE,
      });
      expect(verdict.skipExecution).toBe(true);
      expect(verdict.outcomeIfSkipped).toBe("EXECUTION_CAPABILITY_UNAVAILABLE");
    });

    it("allows website benchmark when OS executor profile is used", () => {
      const bc = getBenchmarkCase("bench.website.landing-page")!;
      const verdict = checkBenchmarkCompatibility({
        benchmarkCase: bc,
        modelId: textModel.modelId,
        executionProfile: BENCHMARK_OS_EXECUTOR_PROFILE,
      });
      expect(verdict.skipExecution).toBe(false);
      expect(verdict.executionCapabilityAvailable).toBe(true);
    });
  });

  describe("OS metadata mirrors production prepass", () => {
    it("stamps WebsiteRoutes schema for website benchmarks", () => {
      const bc = getBenchmarkCase("bench.website.landing-page")!;
      const meta = buildBenchmarkOsMetadata({
        benchmarkCase: bc,
        model: textModel,
        strategy: DEFAULT_BENCHMARK_STRATEGY,
        organizationId: "org_step5",
        executionId: "exec_meta",
      });
      expect(meta.outputKind).toBe("deferred_website");
      expect(meta.structuredOutput).toEqual(
        expect.objectContaining({ name: "WebsiteRoutes", strict: true }),
      );
    });

    it("stamps DocumentPlan schema for print brochure benchmarks", () => {
      const bc = getBenchmarkCase("bench.print.brochures")!;
      const meta = buildBenchmarkOsMetadata({
        benchmarkCase: bc,
        model: textModel,
        strategy: DEFAULT_BENCHMARK_STRATEGY,
        organizationId: "org_step5",
        executionId: "exec_doc",
      });
      expect(meta.structuredOutput).toEqual(
        expect.objectContaining({ name: "DocumentPlan", strict: true }),
      );
    });
  });

  describe("OS materialization through canonical materializers", () => {
    it("materializes brochure PDF artifacts from structured DocumentPlan", async () => {
      const bc = getBenchmarkCase("bench.print.brochures")!;
      const media = createBenchmarkAsyncMediaPlatform();
      const asyncMedia = media.platform;
      const metadata = buildBenchmarkOsMetadata({
        benchmarkCase: bc,
        model: textModel,
        strategy: DEFAULT_BENCHMARK_STRATEGY,
        organizationId: "org_step5",
        executionId: "exec_mat",
      });

      const result = await materializeBenchmarkOsArtifacts({
        benchmarkCase: bc,
        asyncMedia,
        executionId: "exec_mat",
        organizationId: "org_step5",
        metadata,
        runtimeOutput: {
          structured: brochurePlan,
          content: JSON.stringify(brochurePlan),
        },
        providerId: textModel.providerId,
        modelId: textModel.modelId,
        capabilityId: "text.generate",
        createId: (p) => `${p}_test`,
      });

      expect(result.mediaArtifactIds.length).toBeGreaterThan(0);
      expect(result.buildSucceeded).toBe(true);
      expect(result.supportedDownloadFormats).toContain("pdf");
      expect(result.structuredData).toEqual(expect.objectContaining({ title: brochurePlan.title }));
    });
  });

  describe("benchmark executor OS routing", () => {
    it("routes artifact benchmarks through DirectExecution when osBridge is configured", async () => {
      const bc = getBenchmarkCase("bench.print.brochures")!;
      let engineCalls = 0;
      const engine: IDirectExecutionEngine = {
        async run() {
          engineCalls += 1;
          return success({
            resultId: "res_1",
            requestId: "exec_os",
            request: {} as never,
            artifacts: {
              runtime: {
                requestId: "exec_os",
                sessionId: "sess",
                status: "completed",
                success: true,
                response: {
                  requestId: "exec_os",
                  providerId: "provider.openai" as never,
                  output: {
                    structured: brochurePlan,
                    content: JSON.stringify(brochurePlan),
                  },
                  streamed: false,
                  finishedAt: new Date().toISOString(),
                },
                statistics: {
                  queueWaitMs: 0,
                  dispatchMs: 0,
                  executionMs: 10,
                  streamingMs: 0,
                  totalMs: 10,
                  attempts: 1,
                  retries: 0,
                  timeouts: 0,
                  streamingChunks: 0,
                },
                completedAt: new Date().toISOString(),
              },
            },
            trace: {} as never,
            stagesCompleted: ["provider_runtime"],
            success: true,
            durationMs: 10,
            createdAt: new Date().toISOString(),
            version: "direct.1",
          });
        },
        async runPostProcessing() {
          return success({} as never);
        },
      };

      const dispatcher = new ControllableDispatcher({ mode: "success" });
      const dispatchSpy = jest.spyOn(dispatcher, "dispatch");
      const media = createBenchmarkAsyncMediaPlatform();
      const executor = createBenchmarkProviderExecutor({
        dispatcher,
        osBridge: {
          engine,
          asyncMedia: media.platform,
          artifactsRepo: media.artifactsRepo,
        },
      });

      const output = await executor({
        benchmarkCase: bc,
        model: textModel,
        strategy: DEFAULT_BENCHMARK_STRATEGY,
        organizationId: "org_step5",
        executionId: "exec_os",
      });

      expect(engineCalls).toBe(1);
      expect(dispatchSpy).not.toHaveBeenCalled();
      expect(output.executionProfileId).toBe("benchmark_os_executor");
      expect(output.mediaArtifactIds?.length).toBeGreaterThan(0);
      expect(output.buildSucceeded).toBe(true);
      dispatchSpy.mockRestore();
    });

    it("keeps text benchmarks on plain dispatcher path", async () => {
      const bc = getBenchmarkCase("bench.social.copywriting")!;
      const engine: IDirectExecutionEngine = {
        async run() {
          throw new Error("OS engine must not run for text-only benchmarks");
        },
        async runPostProcessing() {
          return success({} as never);
        },
      };

      const dispatcher = new ControllableDispatcher({ mode: "success" });
      const dispatchSpy = jest.spyOn(dispatcher, "dispatch");
      const media = createBenchmarkAsyncMediaPlatform();
      const executor = createBenchmarkProviderExecutor({
        dispatcher,
        osBridge: { engine, asyncMedia: media.platform, artifactsRepo: media.artifactsRepo },
      });

      await executor({
        benchmarkCase: bc,
        model: textModel,
        strategy: DEFAULT_BENCHMARK_STRATEGY,
        organizationId: "org_step5",
        executionId: "exec_text",
      });

      expect(dispatchSpy).toHaveBeenCalled();
      dispatchSpy.mockRestore();
    });
  });

  describe("Step 2 validator reuse", () => {
    it("validates OS materialized brochure output through validateOutputContract", async () => {
      const bc = getBenchmarkCase("bench.print.brochures")!;
      const media = createBenchmarkAsyncMediaPlatform();
      const asyncMedia = media.platform;
      const materialized = await materializeBenchmarkOsArtifacts({
        benchmarkCase: bc,
        asyncMedia,
        executionId: "exec_val",
        organizationId: "org_step5",
        metadata: buildBenchmarkOsMetadata({
          benchmarkCase: bc,
          model: textModel,
          strategy: DEFAULT_BENCHMARK_STRATEGY,
          organizationId: "org_step5",
          executionId: "exec_val",
        }),
        runtimeOutput: {
          structured: brochurePlan,
          content: JSON.stringify(brochurePlan),
        },
        providerId: textModel.providerId,
        modelId: textModel.modelId,
        capabilityId: "text.generate",
        createId: (p) => `${p}_val`,
      });

      const validationOutcome = resolveBenchmarkValidation({
        benchmarkCase: bc,
        executionOutput: {
          preview: materialized.preview,
          structuredData: materialized.structuredData,
          mediaArtifactIds: materialized.mediaArtifactIds,
          buildSucceeded: materialized.buildSucceeded,
          latencyMs: 50,
          executionProfileId: BENCHMARK_OS_EXECUTOR_PROFILE.profileId,
        },
        organizationId: "org_step5",
        executionId: "exec_val",
      });

      expect(validationOutcome.kind).toBe("validated");
      if (validationOutcome.kind === "validated") {
        expect(validationOutcome.validation.requirements.length).toBeGreaterThan(0);
      }
    });
  });

  describe("end-to-end benchmark record", () => {
    it("records performance evidence for mocked OS pipeline execution", async () => {
      const bc = getBenchmarkCase("bench.print.brochures")!;
      const engine: IDirectExecutionEngine = {
        async run() {
          return success({
            resultId: "res_e2e",
            requestId: "exec_e2e",
            request: {} as never,
            artifacts: {
              runtime: {
                requestId: "exec_e2e",
                sessionId: "sess",
                status: "completed",
                success: true,
                response: {
                  requestId: "exec_e2e",
                  providerId: "provider.openai" as never,
                  output: {
                    structured: brochurePlan,
                    content: JSON.stringify(brochurePlan),
                  },
                  streamed: false,
                  finishedAt: new Date().toISOString(),
                },
                statistics: {
                  queueWaitMs: 0,
                  dispatchMs: 0,
                  executionMs: 20,
                  streamingMs: 0,
                  totalMs: 20,
                  attempts: 1,
                  retries: 0,
                  timeouts: 0,
                  streamingChunks: 0,
                },
                completedAt: new Date().toISOString(),
              },
            },
            trace: {} as never,
            stagesCompleted: ["provider_runtime"],
            success: true,
            durationMs: 20,
            createdAt: new Date().toISOString(),
            version: "direct.1",
          });
        },
        async runPostProcessing() {
          return success({} as never);
        },
      };

      const store = new InMemoryBenchmarkPerformanceRecordStore();
      const media = createBenchmarkAsyncMediaPlatform();
      const executor = createBenchmarkProviderExecutor({
        dispatcher: new ControllableDispatcher({ mode: "success" }),
        osBridge: {
          engine,
          asyncMedia: media.platform,
          artifactsRepo: media.artifactsRepo,
        },
      });

      const { record } = await runBenchmark(
        {
          benchmarkId: bc.benchmarkId,
          model: textModel,
          organizationId: "org_step5",
          executeModel: executor,
        },
        { recordStore: store },
      );

      expect(record.executionProfileId).toBe("benchmark_os_executor");
      expect(record.benchmarkOutcome).not.toBe("EXECUTION_CAPABILITY_UNAVAILABLE");
      expect(record.executionInterfacesProvided).toContain("artifact_creation");
      expect(record.validForModelComparison).toBe(false);
    });
  });

  describe("artifact pipeline detection", () => {
    it("identifies OS artifact benchmarks", () => {
      expect(benchmarkCaseUsesOsArtifactPipeline(getBenchmarkCase("bench.print.brochures")!)).toBe(
        true,
      );
      expect(benchmarkCaseUsesOsArtifactPipeline(getBenchmarkCase("bench.social.copywriting")!)).toBe(
        false,
      );
    });
  });

  describe("production safety", () => {
    it("adaptive routing remains disabled", () => {
      expect(loadAdaptiveRoutingConfig({}).adaptiveRoutingEnabled).toBe(false);
    });
  });
});
