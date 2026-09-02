#!/usr/bin/env npx ts-node
/**
 * Stage 1 — Real-model pre-pilot validation (Website + Presentation / 2 models / max 4 API calls).
 *
 * Diagnostic (zero API calls):
 *   npm run benchmark:stage1
 *
 * Execute (max 4 API calls — explicit opt-in):
 *   npm run benchmark:stage1:execute
 */

import { config as loadEnv } from "../src/config/dot.env";
loadEnv();

import {
  OPENAI_TEXT_ENV,
  ANTHROPIC_TEXT_ENV,
  isTextProviderConfigured,
} from "../src/platform/production/execution/text-provider-env";
import { loadAdaptiveRoutingConfig } from "../src/platform/providers/routing/performance/config/adaptive-routing-config";
import { createModelRegistryPlatform } from "../src/platform/model-registry/factories/create-model-registry-platform";
import {
  getBenchmarkCase,
  benchmarkCaseUsesOsArtifactPipeline,
  runBenchmark,
  DEFAULT_BENCHMARK_STRATEGY,
  InMemoryBenchmarkPerformanceRecordStore,
  createProductionBenchmarkExecutor,
  resolveBenchmarkValidationAsync,
  createPerformanceIntelligenceService,
  compareModelsAtScope,
  findMaterialDifferences,
  assertBenchmarkBudget,
  planBenchmarkInvocations,
  STAGE1_REAL_VALIDATION_BENCHMARK_IDS,
  STAGE1_REAL_VALIDATION_MODELS,
  STAGE1_REAL_VALIDATION_MAX_API_CALLS,
  STAGE1_REAL_VALIDATION_REPEAT_COUNT,
  STAGE1_REAL_VALIDATION_KNOWLEDGE_VERSION,
  STAGE1_REAL_VALIDATION_BUDGET,
  stage1RealValidationCellCount,
  type BenchmarkModelTarget,
  type BenchmarkRunResult,
} from "../src/platform/providers/routing/performance/benchmark";
import { createArtifactHydrator } from "../src/platform/os/evaluation/artifact-evaluation";
import {
  logBenchmarkStarted,
  logModelExecutionStarted,
  logModelExecutionCompleted,
  logArtifactCreated,
  logBenchmarkEvaluationReport,
  logBenchmarkEvaluationJson,
  logBenchmarkRealExecutionSummary,
  buildBenchmarkPipelineVerification,
  printStage1ComparisonTable,
  printStage1Totals,
  type BenchmarkPipelineVerification,
} from "../src/platform/providers/routing/performance/benchmark/reporting/benchmark-evaluation-logger";

type ModelAvailability = {
  readonly model: BenchmarkModelTarget;
  readonly available: boolean;
  readonly reason?: string;
};

function checkModelAvailability(): readonly ModelAvailability[] {
  const registry = createModelRegistryPlatform({ loadSeed: true }).registry;

  return STAGE1_REAL_VALIDATION_MODELS.map((model) => {
    if (model.providerId === OPENAI_TEXT_ENV.canonicalProviderId) {
      if (!isTextProviderConfigured(process.env, OPENAI_TEXT_ENV)) {
        return Object.freeze({
          model,
          available: false,
          reason: `Provider ${model.providerId} not configured (missing/disabled ${OPENAI_TEXT_ENV.credentialEnvVar})`,
        });
      }
    } else if (model.providerId === ANTHROPIC_TEXT_ENV.canonicalProviderId) {
      if (!isTextProviderConfigured(process.env, ANTHROPIC_TEXT_ENV)) {
        return Object.freeze({
          model,
          available: false,
          reason: `Provider ${model.providerId} not configured (missing/disabled ${ANTHROPIC_TEXT_ENV.credentialEnvVar})`,
        });
      }
    }

    const registryModel = registry.getModel(model.modelId);
    if (!registryModel.ok) {
      return Object.freeze({
        model,
        available: false,
        reason: `Model ${model.modelId} not found in registry`,
      });
    }

    return Object.freeze({ model, available: true });
  });
}

function printPreflightBanner(): void {
  console.log("\n" + "=".repeat(60));
  console.log("REAL MODEL VALIDATION");
  console.log("=".repeat(60));
  console.log(`Models: ${STAGE1_REAL_VALIDATION_MODELS.length}`);
  console.log(`Services: ${STAGE1_REAL_VALIDATION_BENCHMARK_IDS.length}`);
  console.log(`Benchmarks: ${STAGE1_REAL_VALIDATION_BENCHMARK_IDS.length}`);
  console.log(`Maximum API calls: ${STAGE1_REAL_VALIDATION_MAX_API_CALLS}`);
  console.log(`Adaptive routing: OFF`);
}

function printDryRunPlan(): void {
  console.log("\n" + "-".repeat(50));
  console.log("DRY-RUN EXECUTION PLAN");
  console.log("-".repeat(50));
  console.log("\nModels:");
  for (const m of STAGE1_REAL_VALIDATION_MODELS) {
    console.log(`  - ${m.providerId} / ${m.modelId}`);
  }
  console.log("\nBenchmarks:");
  for (const id of STAGE1_REAL_VALIDATION_BENCHMARK_IDS) {
    const bc = getBenchmarkCase(id)!;
    console.log(
      `  - ${id} (${bc.service}/${bc.subtype}, OS pipeline=${benchmarkCaseUsesOsArtifactPipeline(bc)})`,
    );
  }
  console.log(`\nPlanned cells: ${stage1RealValidationCellCount()}`);
  console.log(`Maximum allowed API calls: ${STAGE1_REAL_VALIDATION_MAX_API_CALLS}`);
  console.log(`Knowledge version: ${STAGE1_REAL_VALIDATION_KNOWLEDGE_VERSION}`);
  console.log(`Strategy: ${DEFAULT_BENCHMARK_STRATEGY.strategyId}@${DEFAULT_BENCHMARK_STRATEGY.version}`);
}

function printPipelineReport(rows: readonly BenchmarkPipelineVerification[]): void {
  console.log("\n" + "-".repeat(50));
  console.log("PIPELINE VERIFICATION SUMMARY");
  console.log("-".repeat(50));
  const all = (key: keyof BenchmarkPipelineVerification) => rows.every((r) => r[key]);
  console.log(`artifact created (all runs): ${all("artifactCreated") ? "yes" : "partial/no"}`);
  console.log(`artifact persisted (all runs): ${all("artifactPersisted") ? "yes" : "partial/no"}`);
  console.log(`artifact hydrated (all runs): ${all("artifactHydrated") ? "yes" : "partial/no"}`);
  console.log(`evaluation executed (all runs): ${all("evaluationExecuted") ? "yes" : "partial/no"}`);
  console.log(`Step 2 executed (all runs): ${all("step2Executed") ? "yes" : "partial/no"}`);
  console.log(`performance record created (all runs): ${all("performanceRecordCreated") ? "yes" : "partial/no"}`);
}

async function executeStage1(): Promise<void> {
  const organizationId = process.env.BENCHMARK_ORG_ID ?? "org_stage1_validation";
  const store = new InMemoryBenchmarkPerformanceRecordStore();
  const intelligence = createPerformanceIntelligenceService({ recordStore: store });

  const executor = await createProductionBenchmarkExecutor({
    organizationId,
    repeatConfig: { repeatCount: 1, nondeterministic: true },
  });

  const results: BenchmarkRunResult[] = [];
  const pipelineRows: BenchmarkPipelineVerification[] = [];
  let apiCalls = 0;
  let artifactsCreated = 0;
  let evaluationFailures = 0;
  let operationalFailures = 0;

  for (const benchmarkId of STAGE1_REAL_VALIDATION_BENCHMARK_IDS) {
    const benchmarkCase = getBenchmarkCase(benchmarkId)!;
    if (!benchmarkCaseUsesOsArtifactPipeline(benchmarkCase)) {
      console.error(`Benchmark ${benchmarkId} does not use OS artifact pipeline — aborting.`);
      process.exit(1);
    }

    for (const model of STAGE1_REAL_VALIDATION_MODELS) {
      if (apiCalls >= STAGE1_REAL_VALIDATION_MAX_API_CALLS) break;

      const requestId = `stage1_${benchmarkId}_${model.modelId}_${Date.now()}`;
      const executionId = requestId;
      logBenchmarkStarted({ benchmarkId, model, executionId });

      let capturedOutput: Awaited<ReturnType<typeof executor>> | undefined;
      const wrappedExecutor = async (
        input: Parameters<typeof executor>[0],
      ): Promise<Awaited<ReturnType<typeof executor>>> => {
        logModelExecutionStarted({ benchmarkId, model });
        capturedOutput = await executor(input);
        logModelExecutionCompleted({
          latencyMs: capturedOutput.latencyMs,
          operationalFailure: Boolean(capturedOutput.operationalFailure),
        });
        return capturedOutput;
      };

      apiCalls += 1;
      const result = await runBenchmark(
        {
          benchmarkId,
          model,
          organizationId,
          strategy: DEFAULT_BENCHMARK_STRATEGY,
          knowledgeVersion: STAGE1_REAL_VALIDATION_KNOWLEDGE_VERSION,
          executeModel: wrappedExecutor,
        },
        { recordStore: store, clearCache: true },
      );
      results.push(result);

      if (result.record.reliabilityStatus === "operational_failure") {
        operationalFailures += 1;
      }
      if (result.record.benchmarkOutcome === "VALIDATION_UNAVAILABLE") {
        evaluationFailures += 1;
      }

      const output = capturedOutput!;
      const artifactIds = output.mediaArtifactIds ?? [];
      if (artifactIds.length > 0) {
        artifactsCreated += artifactIds.length;
        logArtifactCreated({ artifactIds, outputKind: benchmarkCase.outputKind });
      }

      let hydrated: Awaited<ReturnType<ReturnType<typeof createArtifactHydrator>>> | undefined;
      let artifactPersisted = false;
      if (
        artifactIds.length > 0 &&
        output.benchmarkAsyncMedia &&
        output.benchmarkArtifactsRepo
      ) {
        const hydrate = createArtifactHydrator({
          artifactsRepo: output.benchmarkArtifactsRepo,
          blobStorage: output.benchmarkAsyncMedia.blobStorage,
          organizationId,
        });
        hydrated = await hydrate(artifactIds);
        artifactPersisted = hydrated.length === artifactIds.length;
      }

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

      const logInput = {
        executionId,
        requestId,
        benchmarkCase,
        model,
        executionOutput: output,
        record: result.record,
        validation,
        hydratedArtifacts: hydrated,
        artifactPersisted,
      };

      const pipeline = buildBenchmarkPipelineVerification(logInput);
      pipelineRows.push(pipeline);

      logBenchmarkRealExecutionSummary({ ...logInput, pipeline });
      logBenchmarkEvaluationReport(logInput);
      logBenchmarkEvaluationJson(logInput);
    }
  }

  printPipelineReport(pipelineRows);

  const tableRows = results.map((r) =>
    Object.freeze({
      model: r.record.modelId,
      service: r.record.service,
      benchmark: r.record.benchmarkId,
      outcome: r.record.benchmarkOutcome,
      quality: r.record.qualityScore,
      compliance: `${(r.record.hardRequirementPassRate * 100).toFixed(0)}%`,
      latency: r.record.latencyMs,
      cost:
        r.record.costAvailable && r.record.estimatedCost != null
          ? `$${r.record.estimatedCost.toFixed(4)}`
          : "n/a",
      confidence: "INSUFFICIENT_EVIDENCE",
    }),
  );
  printStage1ComparisonTable(tableRows);

  const totalCost = results
    .filter((r) => r.record.costAvailable && r.record.estimatedCost != null)
    .reduce((sum, r) => sum + (r.record.estimatedCost ?? 0), 0);

  printStage1Totals({
    evaluationRecords: results.filter((r) => r.validationAvailable).length,
    performanceRecords: results.length,
    artifactsCreated,
    evaluationFailures,
    operationalFailures,
    apiCallsExecuted: apiCalls,
    apiCallsMaximum: STAGE1_REAL_VALIDATION_MAX_API_CALLS,
  });

  console.log(`\nTotal estimated cost: ${totalCost > 0 ? `$${totalCost.toFixed(4)}` : "unavailable"}`);

  const records = await store.query({ organizationId, limit: 100 });
  const coverage = await intelligence.evidenceCoverage({
    organizationId,
    models: STAGE1_REAL_VALIDATION_MODELS.map((m) => ({
      providerId: m.providerId,
      modelId: m.modelId,
    })),
  });
  console.log("\n" + intelligence.formatCoverage(coverage));

  const comparisons = compareModelsAtScope({
    records,
    modelA: {
      providerId: STAGE1_REAL_VALIDATION_MODELS[0]!.providerId,
      modelId: STAGE1_REAL_VALIDATION_MODELS[0]!.modelId,
    },
    modelB: {
      providerId: STAGE1_REAL_VALIDATION_MODELS[1]!.providerId,
      modelId: STAGE1_REAL_VALIDATION_MODELS[1]!.modelId,
    },
    aggregationLevel: 2,
  });
  const material = findMaterialDifferences(comparisons, 3);

  console.log("\n" + intelligence.formatComparisons(material.length > 0 ? material : comparisons));
  console.log("\nPreliminary observed differences (if any) — INSUFFICIENT_EVIDENCE for routing.");
  console.log("Do NOT use Stage 1 results for adaptive routing or model winner declarations.");
  console.log(`Records in store (append-only): ${await store.count({ organizationId })}`);
}

async function main(): Promise<void> {
  const execute = process.argv.includes("--execute");
  const routingBefore = loadAdaptiveRoutingConfig(process.env);

  printPreflightBanner();
  console.log(`\nAdaptive routing enabled (before): ${routingBefore.adaptiveRoutingEnabled}`);
  if (routingBefore.adaptiveRoutingEnabled) {
    console.error("ABORT: ADAPTIVE_ROUTING_ENABLED must be false.");
    process.exit(1);
  }

  const availability = checkModelAvailability();
  const unavailable = availability.filter((a) => !a.available);
  if (unavailable.length > 0 && execute) {
    console.error("\nModel availability check failed:");
    for (const u of unavailable) {
      console.error(`  - ${u.model.providerId} / ${u.model.modelId}: ${u.reason}`);
    }
    console.error("\nStopping safely — no model substitution performed.");
    process.exit(1);
  }

  const plan = planBenchmarkInvocations({
    benchmarkIds: [...STAGE1_REAL_VALIDATION_BENCHMARK_IDS],
    models: STAGE1_REAL_VALIDATION_MODELS,
    repeatCount: STAGE1_REAL_VALIDATION_REPEAT_COUNT,
    budget: STAGE1_REAL_VALIDATION_BUDGET,
  });

  if (plan.totalInvocations !== STAGE1_REAL_VALIDATION_MAX_API_CALLS) {
    console.error(
      `ABORT BEFORE ANY API CALL: planned ${plan.totalInvocations} invocations (max ${STAGE1_REAL_VALIDATION_MAX_API_CALLS}).`,
    );
    process.exit(1);
  }

  try {
    assertBenchmarkBudget(plan, STAGE1_REAL_VALIDATION_BUDGET);
  } catch (err) {
    console.error(`ABORT BEFORE ANY API CALL: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  printDryRunPlan();

  if (!execute) {
    console.log("\nDiagnostic mode — ZERO API calls made.");
    console.log("Run with --execute to perform exactly 4 real API calls:");
    console.log("  npm run benchmark:stage1:execute");
    return;
  }

  console.log("\nExecuting real-model validation (max 4 API calls)...\n");
  await executeStage1();

  const routingAfter = loadAdaptiveRoutingConfig(process.env);
  console.log(`\nAdaptive routing enabled (after): ${routingAfter.adaptiveRoutingEnabled}`);
  if (routingAfter.adaptiveRoutingEnabled) {
    console.error("WARNING: ADAPTIVE_ROUTING_ENABLED changed during run.");
    process.exit(1);
  }
  console.log("Static production routing unchanged. No adaptive production execution occurred.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
