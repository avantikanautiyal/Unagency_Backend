/**
 * Presentation benchmark → DirectExecution → expansion → materialization (no live providers).
 */

import { createDirectExecutionEngine } from "../../../../src/platform/direct/direct-execution-engine";
import {
  createBenchmarkAsyncMediaPlatform,
  executeBenchmarkOsPipeline,
} from "../../../../src/platform/providers/routing/performance/benchmark/engine/benchmark-os-execution-bridge";
import {
  DEFAULT_BENCHMARK_STRATEGY,
  getBenchmarkCase,
  resolveBenchmarkValidationAsync,
  runBenchmark,
  InMemoryBenchmarkPerformanceRecordStore,
  createBenchmarkProviderExecutor,
  type BenchmarkModelTarget,
} from "../../../../src/platform/providers/routing/performance/benchmark";
import { createProviderRuntime } from "../../../../src/platform/providers/runtime/factories/create-provider-runtime";
import { ControllableDispatcher } from "../../../../src/platform/providers/runtime/testing";
import { createToolRuntimePlatform } from "../../../../src/platform/providers/tools/composition/tool-runtime-platform";
import { InMemoryToolInvocationStore } from "../../../../src/platform/providers/tools/idempotency/in-memory-tool-invocation-store";
import { parseOrRecoverStructuredOutput } from "../../../../src/platform/providers/tools/structured/structured-output-execution";
import { PRESENTATION_ROUTES_STRUCTURED_SCHEMA } from "../../../../src/platform/os/delivery/presentation-schemas";
import {
  parsePresentationRoutes,
  recoverPresentationRoutesPayload,
} from "../../../../src/platform/os/delivery/document-export-service";
import * as documentExportService from "../../../../src/platform/os/delivery/document-export-service";

const textModel: BenchmarkModelTarget = Object.freeze({
  providerId: "provider.openai",
  modelId: "openai/gpt-4o",
  capabilityId: "text.generate",
});

function createPresentationDirectEngine() {
  const dispatcher = new ControllableDispatcher({ mode: "success" });
  const runtime = createProviderRuntime({ dispatcher });
  const toolRuntime = createToolRuntimePlatform({
    dispatcher,
    runtime,
    invocationStore: new InMemoryToolInvocationStore(),
    durable: false,
  });
  const engine = createDirectExecutionEngine({
    runtime,
    toolRuntime,
  });
  return { engine, dispatcher };
}

describe("presentation benchmark OS pipeline (mock providers)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("recovers near-miss PresentationRoutes during structured parse", () => {
    const nearMiss = {
      routes: [
        {
          title: "Heritage",
          description: "Warm story",
          slides: [
            {
              title: "Opening",
              bullets: ["Brand-led growth", "Clear ICP"],
            },
          ],
        },
      ],
    };
    const parsed = parseOrRecoverStructuredOutput(
      JSON.stringify(nearMiss),
      {
        name: "PresentationRoutes",
        schema: PRESENTATION_ROUTES_STRUCTURED_SCHEMA as unknown as Record<
          string,
          unknown
        >,
        strict: true,
      }
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsePresentationRoutes(parsed.value)).not.toBeNull();
    }
  });

  it("runs pitch-deck benchmark through expansion without missing_routes", async () => {
    jest
      .spyOn(documentExportService, "buildPresentationPptx")
      .mockResolvedValue(Buffer.from("PK-fake-pptx"));

    const bc = getBenchmarkCase("bench.presentations.pitch-decks")!;
    const { engine, dispatcher } = createPresentationDirectEngine();
    const media = createBenchmarkAsyncMediaPlatform();

    const output = await executeBenchmarkOsPipeline(
      {
        engine,
        asyncMedia: media.platform,
        artifactsRepo: media.artifactsRepo,
        workspaceId: "ws_pres_test",
      },
      {
        benchmarkCase: bc,
        model: textModel,
        strategy: DEFAULT_BENCHMARK_STRATEGY,
        organizationId: "org_pres_test",
        executionId: "exec_pres_bench",
      }
    );

    expect(output.operationalFailure).toBeUndefined();
    expect(output.mediaArtifactIds?.length).toBeGreaterThan(0);
    expect(output.buildSucceeded).toBe(true);
    const routes = parsePresentationRoutes(
      recoverPresentationRoutesPayload(output.structuredData)
    );
    expect(routes).not.toBeNull();
    expect(routes!.length).toBeGreaterThanOrEqual(1);
    expect(dispatcher.attempts).toBeGreaterThanOrEqual(2);
  });

  it("materializes artifacts and reaches Step 2 + Evaluation Plane", async () => {
    jest
      .spyOn(documentExportService, "buildPresentationPptx")
      .mockResolvedValue(Buffer.from("PK-fake-pptx"));

    const bc = getBenchmarkCase("bench.presentations.pitch-decks")!;
    const { engine } = createPresentationDirectEngine();
    const media = createBenchmarkAsyncMediaPlatform();

    const output = await executeBenchmarkOsPipeline(
      {
        engine,
        asyncMedia: media.platform,
        artifactsRepo: media.artifactsRepo,
      },
      {
        benchmarkCase: bc,
        model: textModel,
        strategy: DEFAULT_BENCHMARK_STRATEGY,
        organizationId: "org_pres_eval",
        executionId: "exec_pres_eval",
      }
    );

    expect(output.operationalFailure).toBeUndefined();
    const validationOutcome = await resolveBenchmarkValidationAsync({
      benchmarkCase: bc,
      executionOutput: output,
      organizationId: "org_pres_eval",
      executionId: "exec_pres_eval",
      artifactEvaluationDeps: {
        asyncMedia: media.platform,
        artifactsRepo: media.artifactsRepo,
      },
    });
    expect(validationOutcome.kind).toBe("validated");
    if (validationOutcome.kind === "validated") {
      expect(validationOutcome.validation.requirements.length).toBeGreaterThan(0);
      expect(
        validationOutcome.validation.provenance.some(
          (p) => p.field === "evaluationPlaneId" || p.field === "artifactEvaluatorId"
        )
      ).toBe(true);
    }
  });

  it("records ModelPerformanceRecord via benchmark executor", async () => {
    jest
      .spyOn(documentExportService, "buildPresentationPptx")
      .mockResolvedValue(Buffer.from("PK-fake-pptx"));

    const bc = getBenchmarkCase("bench.presentations.pitch-decks")!;
    const { engine } = createPresentationDirectEngine();
    const media = createBenchmarkAsyncMediaPlatform();
    const store = new InMemoryBenchmarkPerformanceRecordStore();
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
        organizationId: "org_pres_record",
        executeModel: executor,
      },
      { recordStore: store }
    );

    expect(record.executionProfileId).toBe("benchmark_os_executor");
    expect(record.benchmarkOutcome).not.toBe("PROVIDER_OPERATIONAL_FAILURE");
    expect(record.executionInterfacesProvided).toContain("artifact_creation");
  });
});
