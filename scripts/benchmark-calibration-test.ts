#!/usr/bin/env npx ts-node
/**
 * Step 4B — Controlled calibration run (real providers, minimal scope).
 *
 * Usage:
 *   npm run benchmark:calibrate              # plan only
 *   npm run benchmark:calibrate:execute      # controlled execution
 */

import { config as loadEnv } from "../src/config/dot.env";
loadEnv();

import {
  evaluateTextProviderEnv,
  type TextProviderEnvStatus,
} from "../src/platform/production/execution/text-provider-env";
import { loadAdaptiveRoutingConfig } from "../src/platform/providers/routing/performance/config/adaptive-routing-config";
import {
  buildCalibrationRunPlan,
  formatCalibrationRunPlan,
} from "../src/platform/providers/routing/performance/benchmark/config/benchmark-calibration-run-config";
import { createRealBenchmarkExecutionService } from "../src/platform/providers/routing/performance/benchmark/engine/benchmark-real-execution-service";
import { BENCHMARK_OUTCOME_LABELS } from "../src/platform/providers/routing/performance/benchmark/contracts/benchmark-outcome";
import { describeCostDrivers } from "../src/platform/providers/routing/performance/benchmark/engine/benchmark-cost-accounting";

function printProviderDiagnostics(
  statuses: readonly TextProviderEnvStatus[] = evaluateTextProviderEnv(process.env),
): { readonly ready: readonly TextProviderEnvStatus[] } {
  console.log("Provider discovery (safe — no secrets):\n");
  for (const s of statuses) {
    console.log(`- ${s.providerId}: enabled=${s.enabled}, credential present=${s.configured}`);
  }
  const ready = statuses.filter((s) => s.enabled && s.configured);
  console.log(`\nConfigured providers: ${ready.length}\n`);
  return Object.freeze({ ready });
}

async function main(): Promise<void> {
  const execute = process.argv.includes("--execute");
  const { ready } = printProviderDiagnostics();

  if (ready.length < 2) {
    console.error("Need at least 2 configured providers for calibration.");
    process.exit(1);
  }

  const calibrationPlan = buildCalibrationRunPlan({
    readyProviders: ready.map((p) =>
      Object.freeze({
        providerId: p.providerId,
        enabled: p.enabled,
        configured: p.configured,
      }),
    ),
  });

  console.log(formatCalibrationRunPlan(calibrationPlan));

  if (!execute) {
    console.log("\nCalibration plan only. Re-run with --execute for controlled API calls.");
    return;
  }

  const organizationId = process.env.BENCHMARK_ORG_ID ?? "org_benchmark_calibration";
  console.log(`\nExecuting calibration (org=${organizationId})...\n`);

  const service = createRealBenchmarkExecutionService({ useProductionExecutor: true });
  const output = await service.runControlled({
    benchmarkIds: [...calibrationPlan.benchmarkIds],
    models: [...calibrationPlan.models],
    organizationId,
    repeatConfig: calibrationPlan.repeatConfig,
    budget: calibrationPlan.plan.totalInvocations <= 12
      ? { maxInvocations: 12, largeRunThreshold: 12, allowLargeRunOverride: true }
      : undefined,
  });

  console.log("\n" + "=".repeat(60));
  console.log("CALIBRATION FINAL REPORT");
  console.log("=".repeat(60));

  const apiCalls = output.observability.filter((e) => e.operationalStatus === "success").length;
  const preFlightSkips = output.results.filter(
    (r) => r.record.benchmarkOutcome === "EXECUTION_CAPABILITY_UNAVAILABLE" ||
      r.record.benchmarkOutcome === "MODEL_CAPABILITY_UNSUPPORTED",
  ).length;

  console.log(`\nActual provider API calls: ${apiCalls}`);
  console.log(`Pre-flight skipped (no API): ${preFlightSkips}`);
  console.log(`Performance records: ${output.results.length}`);

  const byOutcome: Record<string, number> = {};
  for (const r of output.results) {
    byOutcome[r.record.benchmarkOutcome] = (byOutcome[r.record.benchmarkOutcome] ?? 0) + 1;
  }
  console.log("\nOutcomes:");
  for (const [k, v] of Object.entries(byOutcome)) {
    console.log(`  ${k}: ${v} — ${BENCHMARK_OUTCOME_LABELS[k as keyof typeof BENCHMARK_OUTCOME_LABELS] ?? k}`);
  }

  console.log("\nPer-run:");
  for (const r of output.results) {
    const rec = r.record;
    console.log(
      `  ${rec.benchmarkId} | ${rec.providerId}/${rec.modelId} | outcome=${rec.benchmarkOutcome} | ` +
        `validComparison=${rec.validForModelComparison} | validation=${rec.validationStatus} | ` +
        `quality=${rec.qualityScore} | latency=${rec.latencyMs}ms` +
        (rec.costBreakdown
          ? ` | tokens=${rec.costBreakdown.inputTokens}+${rec.costBreakdown.outputTokens}`
          : ""),
    );
    if (rec.qualityScoreInterpretation) {
      console.log(`    note: ${rec.qualityScoreInterpretation}`);
    }
    if (rec.costBreakdown) {
      console.log(`    cost: ${describeCostDrivers(rec.costBreakdown)}`);
    }
  }

  const routing = loadAdaptiveRoutingConfig(process.env);
  console.log("\nProduction routing unchanged:", !routing.adaptiveRoutingEnabled);
  console.log("No training/fine-tuning performed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
