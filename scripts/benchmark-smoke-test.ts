#!/usr/bin/env npx ts-node
/**
 * Step 4A — Manual real-provider benchmark smoke test.
 *
 * Loads `.env` via the same bootstrap as the backend (`src/config/dot.env.ts`).
 *
 * Usage:
 *   npm run benchmark:smoke              # provider discovery + execution plan (no API calls)
 *   npm run benchmark:smoke:execute      # controlled 2-model pilot (≤12 invocations)
 *
 * Or directly (requires transpile-only, same as other backend scripts):
 *   TS_NODE_TRANSPILE_ONLY=true npx ts-node scripts/benchmark-smoke-test.ts
 *
 * Optional env:
 *   BENCHMARK_ORG_ID=org_benchmark_smoke
 *   BENCHMARK_SMOKE_MODELS=provider.openai:openai/gpt-4o,provider.anthropic:anthropic/claude-sonnet-4-5
 *   BENCHMARK_SMOKE_BENCHMARK_IDS=bench.website.landing-page,bench.social.copywriting,...
 *
 * Does NOT run in CI — no credentials committed or printed.
 */

import { config as loadEnv } from "../src/config/dot.env";
import {
  evaluateTextProviderEnv,
  type TextProviderEnvStatus,
} from "../src/platform/production/execution/text-provider-env";
import { loadAdaptiveRoutingConfig } from "../src/platform/providers/routing/performance/config/adaptive-routing-config";
import {
  buildSmokeRunConfig,
  formatSmokeExecutionPlan,
} from "../src/platform/providers/routing/performance/benchmark/config/benchmark-smoke-run-config";
import { createRealBenchmarkExecutionService } from "../src/platform/providers/routing/performance/benchmark/engine/benchmark-real-execution-service";
import type { BenchmarkRunResult } from "../src/platform/providers/routing/performance/benchmark/engine/benchmark-runner";
import type { BenchmarkExecutionObservabilityEvent } from "../src/platform/providers/routing/performance/benchmark/engine/benchmark-provider-executor";

/** Must run before any process.env reads — matches backend entrypoint (index.ts). */
loadEnv();

export function printProviderDiagnostics(
  statuses: readonly TextProviderEnvStatus[] = evaluateTextProviderEnv(process.env),
): { readonly ready: readonly TextProviderEnvStatus[]; readonly total: number } {
  console.log("Provider discovery (safe diagnostic — no secrets printed):\n");
  for (const s of statuses) {
    console.log(
      `- ${s.providerId}: enabled=${s.enabled}, credential present=${s.configured}`,
    );
  }
  const ready = statuses.filter((s) => s.enabled && s.configured);
  console.log(`\nConfigured providers: ${ready.length}`);
  return Object.freeze({ ready, total: ready.length });
}

function printSmokeExecutionSummary(input: {
  readonly results: readonly BenchmarkRunResult[];
  readonly observability: readonly BenchmarkExecutionObservabilityEvent[];
  readonly benchmarkIds: readonly string[];
  readonly models: readonly { providerId: string; modelId: string }[];
}): void {
  const { results, observability, benchmarkIds, models } = input;

  const successful = results.filter((r) => r.record.reliabilityStatus !== "operational_failure");
  const operationalFailures = results.filter((r) => r.record.reliabilityStatus === "operational_failure");
  const unsupported = operationalFailures.filter(
    (r) => r.record.operationalFailureCategory === "unsupported_capability",
  );

  const totalCost = results
    .filter((r) => r.record.costAvailable && r.record.estimatedCost != null)
    .reduce((sum, r) => sum + (r.record.estimatedCost ?? 0), 0);
  const costAvailableCount = results.filter((r) => r.record.costAvailable).length;

  const allUnmeasured = new Set<string>();
  for (const r of results) {
    for (const d of r.record.unmeasuredQualityDimensions) allUnmeasured.add(d);
  }

  console.log("\n" + "=".repeat(60));
  console.log("SMOKE TEST FINAL REPORT");
  console.log("=".repeat(60));
  console.log("\nModels tested:");
  for (const m of models) {
    console.log(`  - ${m.providerId} / ${m.modelId}`);
  }

  console.log("\nBenchmark cases executed:");
  for (const id of benchmarkIds) {
    console.log(`  - ${id}`);
  }

  console.log(`\nActual API calls: ${observability.length}`);
  console.log(`Performance records created: ${results.length}`);
  console.log(`Successful executions: ${successful.length}`);
  console.log(`Operational failures: ${operationalFailures.length}`);
  console.log(`Unsupported capabilities: ${unsupported.length}`);

  console.log("\nPer-run summary:");
  for (const r of results) {
    const rec = r.record;
    console.log(
      `  ${rec.benchmarkId} | ${rec.providerId}/${rec.modelId} | ` +
        `validation=${rec.validationStatus} | quality=${rec.qualityScore} | ` +
        `hardReq=${(rec.hardRequirementPassRate * 100).toFixed(0)}% | ` +
        `latency=${rec.latencyMs}ms | reliability=${rec.reliabilityStatus}` +
        (rec.operationalFailureCategory ? ` (${rec.operationalFailureCategory})` : "") +
        (rec.costAvailable && rec.estimatedCost != null ? ` | cost=$${rec.estimatedCost.toFixed(4)}` : ""),
    );
  }

  if (costAvailableCount > 0) {
    console.log(`\nTotal estimated cost (where available): $${totalCost.toFixed(4)} (${costAvailableCount} runs)`);
  } else {
    console.log("\nCost: unavailable for all runs");
  }

  if (allUnmeasured.size > 0) {
    console.log(`\nNOT_AUTOMATED dimensions (unmeasured): ${[...allUnmeasured].join(", ")}`);
  }

  console.log("\nArtifacts generated: none (benchmark records do not persist artifact refs)");

  const routingConfig = loadAdaptiveRoutingConfig(process.env);
  console.log("\nProduction routing:");
  console.log(`  Adaptive routing enabled: ${routingConfig.adaptiveRoutingEnabled}`);
  console.log("  No routing changes applied by this smoke test.");
  console.log("  No training or fine-tuning performed.");
  console.log("  No automatic winner selected.");
}

async function main(): Promise<void> {
  const execute = process.argv.includes("--execute");
  const { ready, total } = printProviderDiagnostics();

  if (total === 0) {
    console.error(
      "\nNo configured providers found after loading .env.",
      "Ensure *_ENABLED=true and the matching *_API_KEY is set in unagency-backend/.env",
      "(or exported in the shell).",
    );
    process.exit(1);
  }

  let smokeConfig;
  try {
    smokeConfig = buildSmokeRunConfig({
      readyProviders: ready.map((p) =>
        Object.freeze({
          providerId: p.providerId,
          enabled: p.enabled,
          configured: p.configured,
        }),
      ),
    });
  } catch (err) {
    console.error("\nSmoke configuration error:", err instanceof Error ? err.message : err);
    process.exit(1);
  }

  console.log("\n" + formatSmokeExecutionPlan(smokeConfig));

  if (!execute) {
    console.log(
      "\nDiagnostic complete. No benchmark execution performed (no API calls).",
      "Re-run with --execute to run the controlled pilot.",
    );
    return;
  }

  if (!smokeConfig.plan.withinMaxInvocations) {
    console.error(
      `\nAborting: planned invocations (${smokeConfig.plan.totalInvocations}) exceed budget (${smokeConfig.budget.maxInvocations}).`,
    );
    process.exit(1);
  }

  const organizationId = process.env.BENCHMARK_ORG_ID ?? "org_benchmark_smoke";
  console.log(`\nExecuting controlled smoke pilot (org=${organizationId})...\n`);

  const service = createRealBenchmarkExecutionService({ useProductionExecutor: true });

  const output = await service.runControlled({
    benchmarkIds: [...smokeConfig.benchmarkIds],
    models: [...smokeConfig.models],
    organizationId,
    repeatConfig: smokeConfig.repeatConfig,
    budget: smokeConfig.budget,
  });

  console.log(`\nCompleted ${output.results.length} benchmark execution(s)\n`);

  for (const report of output.reports) {
    console.log(report.textReport);
    console.log("\n---\n");
  }

  for (const benchmarkId of smokeConfig.benchmarkIds) {
    const scoped = output.results.filter((r) => r.record.benchmarkId === benchmarkId);
    if (scoped.length >= 2) {
      const comparison = service.compareBenchmark(benchmarkId, scoped);
      console.log(comparison.textReport);
      console.log("\n---\n");
    }
  }

  printSmokeExecutionSummary({
    results: output.results,
    observability: output.observability,
    benchmarkIds: smokeConfig.benchmarkIds,
    models: smokeConfig.models,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
