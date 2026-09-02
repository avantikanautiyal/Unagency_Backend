#!/usr/bin/env npx ts-node
/**
 * Priority 1.3 — Minimal live presentation validation (1 benchmark cell, Anthropic only).
 *
 *   npm run benchmark:presentation:live:p13
 */

import { config as loadEnv } from "../src/config/dot.env";
loadEnv();

import { loadAdaptiveRoutingConfig } from "../src/platform/providers/routing/performance/config/adaptive-routing-config";
import {
  ANTHROPIC_TEXT_ENV,
  isTextProviderConfigured,
} from "../src/platform/production/execution/text-provider-env";
import { createModelRegistryPlatform } from "../src/platform/model-registry/factories/create-model-registry-platform";
import {
  DEFAULT_BENCHMARK_STRATEGY,
  TIER1_CONTROLLED_EVIDENCE_KNOWLEDGE_VERSION,
  buildEvidenceMatrix,
  planBenchmarkInvocations,
  getBenchmarkCase,
  benchmarkCaseUsesOsArtifactPipeline,
  runBenchmark,
  createProductionBenchmarkExecutor,
  InMemoryBenchmarkPerformanceRecordStore,
  resolveBenchmarkValidationAsync,
  type BenchmarkModelTarget,
  type BenchmarkExecutionOutput,
} from "../src/platform/providers/routing/performance/benchmark";
import { DEFAULT_BENCHMARK_BUDGET } from "../src/platform/providers/routing/performance/benchmark/contracts/benchmark-execution-config";
import { createArtifactHydrator } from "../src/platform/os/evaluation/artifact-evaluation";
import {
  beginExecutionTrace,
  buildExecutionTraceSummary,
  finalizeExecutionTrace,
  recordExecutionTraceStage,
} from "../src/platform/os/observability/execution-trace";
import {
  buildBenchmarkPipelineVerification,
  logBenchmarkEvaluationReport,
} from "../src/platform/providers/routing/performance/benchmark/reporting/benchmark-evaluation-logger";

const BENCHMARK_ID = "bench.presentations.pitch-decks";
const ANTHROPIC_MODEL: BenchmarkModelTarget = Object.freeze({
  providerId: "provider.anthropic",
  modelId: "anthropic/claude-sonnet-4-5",
  capabilityId: "text.generate",
});

const MAX_INVOCATIONS = 1;

function abort(message: string): never {
  console.error(`[P1.3-LIVE] ABORT: ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const routing = loadAdaptiveRoutingConfig(process.env);
  if (routing.adaptiveRoutingEnabled) {
    abort("ADAPTIVE_ROUTING_ENABLED must be false.");
  }

  if (!isTextProviderConfigured(process.env, ANTHROPIC_TEXT_ENV)) {
    abort(`Anthropic not configured (${ANTHROPIC_TEXT_ENV.credentialEnvVar}).`);
  }

  const registry = createModelRegistryPlatform({ loadSeed: true }).registry;
  const reg = registry.getModel(ANTHROPIC_MODEL.modelId);
  if (!reg.ok) abort(`Model ${ANTHROPIC_MODEL.modelId} not in registry.`);

  const benchmarkCase = getBenchmarkCase(BENCHMARK_ID);
  if (!benchmarkCase) abort(`Unknown benchmark ${BENCHMARK_ID}.`);
  if (!benchmarkCaseUsesOsArtifactPipeline(benchmarkCase)) {
    abort(`${BENCHMARK_ID} does not use OS artifact pipeline.`);
  }

  const matrix = buildEvidenceMatrix({
    strategy: "targeted",
    benchmarkIds: [BENCHMARK_ID],
    models: [ANTHROPIC_MODEL],
    repeatCount: 1,
    knowledgeVersions: [TIER1_CONTROLLED_EVIDENCE_KNOWLEDGE_VERSION],
  });

  const invocationPlan = planBenchmarkInvocations({
    benchmarkIds: [BENCHMARK_ID],
    models: [ANTHROPIC_MODEL],
    repeatCount: 1,
    budget: Object.freeze({
      ...DEFAULT_BENCHMARK_BUDGET,
      maxInvocations: MAX_INVOCATIONS,
      largeRunThreshold: MAX_INVOCATIONS,
      allowLargeRunOverride: false,
    }),
  });

  console.log("[P1.3-LIVE] Preflight plan");
  console.log(`  benchmark: ${BENCHMARK_ID}`);
  console.log(`  model: ${ANTHROPIC_MODEL.modelId}`);
  console.log(`  cells: ${matrix.cells.length}`);
  console.log(`  invocations: ${invocationPlan.totalInvocations}`);
  console.log(`  adaptive routing: OFF`);

  if (matrix.cells.length !== 1) {
    abort(`Expected exactly 1 plan cell, got ${matrix.cells.length}.`);
  }
  if (invocationPlan.totalInvocations !== 1) {
    abort(
      `Expected exactly 1 provider invocation in plan, got ${invocationPlan.totalInvocations}.`,
    );
  }

  const organizationId = process.env.BENCHMARK_ORG_ID ?? "org_p13_live_validation";
  const store = new InMemoryBenchmarkPerformanceRecordStore();
  const executor = await createProductionBenchmarkExecutor({
    organizationId,
    repeatConfig: { repeatCount: 1, nondeterministic: true },
  });

  let capturedOutput: BenchmarkExecutionOutput | undefined;
  const wrappedExecutor = async (
    input: Parameters<typeof executor>[0],
  ): Promise<BenchmarkExecutionOutput> => {
    console.log(
      `[P1.3-LIVE] Executing benchmark cell | executionId=${input.executionId} | provider=${input.model.providerId} | model=${input.model.modelId}`,
    );
    capturedOutput = await executor(input);
    return capturedOutput;
  };

  console.log("[P1.3-LIVE] Starting single live benchmark invocation…");

  const { record } = await runBenchmark(
    {
      benchmarkId: BENCHMARK_ID,
      model: ANTHROPIC_MODEL,
      organizationId,
      strategy: DEFAULT_BENCHMARK_STRATEGY,
      knowledgeVersion: TIER1_CONTROLLED_EVIDENCE_KNOWLEDGE_VERSION,
      executeModel: wrappedExecutor,
    },
    { recordStore: store, clearCache: true },
  );

  const output = capturedOutput!;
  const executionId = record.executionId;

  beginExecutionTrace({
    requestId: executionId,
    executionId,
    correlationId: executionId,
    service: benchmarkCase.service,
    subtype: benchmarkCase.subtype,
    outputKind: benchmarkCase.outputKind,
    requestedProviderId: ANTHROPIC_MODEL.providerId,
    requestedModelId: ANTHROPIC_MODEL.modelId,
    adaptiveRoutingEnabled: false,
    usedStructuredOutput: true,
    usedOsArtifactPipeline: true,
  });

  recordExecutionTraceStage({
    executionId,
    stage: "static_routing",
    status: "COMPLETED",
    details: Object.freeze({ routingMode: "static", adaptiveRoutingEnabled: false }),
  });
  recordExecutionTraceStage({
    executionId,
    stage: "adaptive_routing",
    status: "SKIPPED",
    skipReason: "ADAPTIVE_ROUTING_DISABLED",
  });
  recordExecutionTraceStage({
    executionId,
    stage: "provider_selection",
    status: "COMPLETED",
    details: Object.freeze({
      providerId: ANTHROPIC_MODEL.providerId,
      modelId: ANTHROPIC_MODEL.modelId,
      pinned: true,
    }),
  });
  recordExecutionTraceStage({
    executionId,
    stage: "provider_dispatch",
    status: output.operationalFailure ? "FAILED" : "COMPLETED",
  });
  recordExecutionTraceStage({
    executionId,
    stage: "structured_output",
    status: output.structuredData ? "COMPLETED" : "FAILED",
    skipReason: output.structuredData ? undefined : "structured_output_missing",
  });
  recordExecutionTraceStage({
    executionId,
    stage: "os_materialization",
    status: output.buildSucceeded === false ? "FAILED" : "COMPLETED",
  });
  recordExecutionTraceStage({
    executionId,
    stage: "artifact_persistence",
    status: (output.mediaArtifactIds?.length ?? 0) > 0 ? "COMPLETED" : "SKIPPED",
    skipReason:
      (output.mediaArtifactIds?.length ?? 0) > 0 ? undefined : "no_artifacts_to_persist",
  });

  let hydratedArtifacts: Awaited<ReturnType<ReturnType<typeof createArtifactHydrator>>> | undefined;
  if (
    (output.mediaArtifactIds?.length ?? 0) > 0 &&
    output.benchmarkAsyncMedia &&
    output.benchmarkArtifactsRepo
  ) {
    const hydrate = createArtifactHydrator({
      artifactsRepo: output.benchmarkArtifactsRepo,
      blobStorage: output.benchmarkAsyncMedia.blobStorage,
      organizationId,
    });
    hydratedArtifacts = await hydrate(output.mediaArtifactIds!);
  }
  const hydratedCount = hydratedArtifacts?.length ?? 0;

  const validationOutcome = await resolveBenchmarkValidationAsync({
    benchmarkCase,
    executionOutput: output,
    organizationId,
    executionId,
    artifactEvaluationDeps:
      output.benchmarkAsyncMedia && output.benchmarkArtifactsRepo
        ? {
            asyncMedia: output.benchmarkAsyncMedia,
            artifactsRepo: output.benchmarkArtifactsRepo,
          }
        : undefined,
  });

  const validation =
    validationOutcome.kind === "validated" ? validationOutcome.validation : undefined;

  const pipeline = buildBenchmarkPipelineVerification({
    executionId,
    benchmarkCase,
    model: ANTHROPIC_MODEL,
    executionOutput: output,
    record,
    validation,
    hydratedArtifacts,
    artifactPersisted: hydratedCount === (output.mediaArtifactIds?.length ?? 0),
  });

  recordExecutionTraceStage({
    executionId,
    stage: "artifact_hydration",
    status: pipeline.artifactHydrated ? "COMPLETED" : hydratedCount > 0 ? "FAILED" : "SKIPPED",
    skipReason: hydratedCount === 0 ? "no_artifacts_hydrated" : undefined,
  });
  recordExecutionTraceStage({
    executionId,
    stage: "evaluation_plane",
    status: pipeline.evaluationExecuted ? "COMPLETED" : "SKIPPED",
    skipReason: pipeline.evaluationExecuted ? undefined : "evaluation_plane_not_executed",
  });
  recordExecutionTraceStage({
    executionId,
    stage: "step2_validation",
    status: pipeline.step2Executed ? "COMPLETED" : "SKIPPED",
    skipReason: pipeline.step2Executed ? undefined : "step2_not_executed",
  });
  recordExecutionTraceStage({
    executionId,
    stage: "model_performance_record",
    status: pipeline.performanceRecordCreated ? "COMPLETED" : "FAILED",
  });

  const trace = finalizeExecutionTrace(executionId);

  logBenchmarkEvaluationReport({
    executionId,
    benchmarkCase,
    model: ANTHROPIC_MODEL,
    executionOutput: output,
    record,
    validation,
    hydratedArtifacts,
    artifactPersisted: hydratedCount === (output.mediaArtifactIds?.length ?? 0),
  });

  console.log("\n[P1.3-LIVE] === ACCEPTANCE CHECK ===");
  const artifactIds = output.mediaArtifactIds ?? [];
  const checks = Object.freeze({
    noOperationalFailure: !output.operationalFailure,
    hasStructuredData: Boolean(output.structuredData),
    artifactsPresent: artifactIds.length > 0,
    artifactPersisted: pipeline.artifactPersisted,
    artifactHydrated: pipeline.artifactHydrated,
    evaluationExecuted: pipeline.evaluationExecuted,
    step2Executed: pipeline.step2Executed,
    performanceRecordCreated: pipeline.performanceRecordCreated,
    recordCreated: Boolean(record.recordId),
    adaptiveRoutingOff: !routing.adaptiveRoutingEnabled,
  });

  console.log(JSON.stringify(checks, null, 2));
  console.log(`artifactIds: ${artifactIds.join(", ") || "none"}`);
  console.log(`benchmarkOutcome: ${record.benchmarkOutcome}`);
  console.log(`qualityScore: ${record.qualityScore}`);
  console.log(`operationalFailure: ${output.operationalFailure?.message ?? "none"}`);

  if (trace) {
    console.log("\n" + buildExecutionTraceSummary(trace));
  }

  const pass =
    checks.noOperationalFailure &&
    checks.hasStructuredData &&
    checks.artifactsPresent &&
    checks.artifactPersisted &&
    checks.artifactHydrated &&
    checks.evaluationExecuted &&
    checks.step2Executed &&
    checks.performanceRecordCreated &&
    checks.adaptiveRoutingOff;

  console.log(`\n[P1.3-LIVE] FINAL: ${pass ? "PASS" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error("[P1.3-LIVE] Unhandled error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
