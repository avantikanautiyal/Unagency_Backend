/**
 * Step 4B — Controlled calibration run configuration.
 */

import { getBenchmarkCase } from "../catalog/benchmark-catalog";
import { CALIBRATION_DEFAULT_BENCHMARK_IDS } from "../catalog/benchmark-control-catalog";
import {
  assertBenchmarkBudget,
  PILOT_BENCHMARK_BUDGET,
  planBenchmarkInvocations,
  type BenchmarkInvocationPlan,
  type BenchmarkRepeatConfig,
  DEFAULT_REPEAT_CONFIG,
} from "../contracts/benchmark-execution-config";
import type { BenchmarkModelTarget } from "../contracts/benchmark-case";
import { checkBenchmarkCompatibility } from "../engine/benchmark-compatibility";
import { benchmarkCaseUsesOsArtifactPipeline } from "../engine/benchmark-os-execution-metadata";
import {
  BENCHMARK_EXECUTOR_PROFILE,
  BENCHMARK_OS_EXECUTOR_PROFILE,
} from "../engine/benchmark-execution-profile";
import {
  parseSmokeModelSpecsFromEnv,
  resolveSmokeModels,
  type ConfiguredProviderRef,
  type SmokeModelSpec,
  SMOKE_DEFAULT_MODEL_SPECS,
} from "./benchmark-smoke-run-config";

export { CALIBRATION_DEFAULT_BENCHMARK_IDS, SMOKE_DEFAULT_MODEL_SPECS };

export type CalibrationRunPlan = {
  readonly models: readonly BenchmarkModelTarget[];
  readonly benchmarkIds: readonly string[];
  readonly repeatConfig: BenchmarkRepeatConfig;
  readonly plan: BenchmarkInvocationPlan;
  readonly preFlightSkips: readonly {
    readonly benchmarkId: string;
    readonly modelId: string;
    readonly outcome: string;
    readonly reasons: readonly string[];
  }[];
  readonly executableInvocations: number;
};

function parseCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function resolveCalibrationBenchmarkIds(
  env: NodeJS.ProcessEnv = process.env,
): readonly string[] {
  const fromEnv = parseCsv(env.BENCHMARK_CALIBRATION_BENCHMARK_IDS);
  const ids = fromEnv.length > 0 ? fromEnv : [...CALIBRATION_DEFAULT_BENCHMARK_IDS];
  const missing = ids.filter((id) => !getBenchmarkCase(id));
  if (missing.length > 0) {
    throw new Error(`Calibration benchmark cases not found: ${missing.join(", ")}`);
  }
  return Object.freeze(ids);
}

export function buildCalibrationRunPlan(input: {
  readonly readyProviders: readonly ConfiguredProviderRef[];
  readonly env?: NodeJS.ProcessEnv;
  readonly modelSpecs?: readonly SmokeModelSpec[];
}): CalibrationRunPlan {
  const env = input.env ?? process.env;
  const modelSpecs = input.modelSpecs ?? parseSmokeModelSpecsFromEnv(env);
  const models = resolveSmokeModels(modelSpecs, input.readyProviders);
  const benchmarkIds = resolveCalibrationBenchmarkIds(env);
  const repeatConfig = DEFAULT_REPEAT_CONFIG;

  const preFlightSkips: CalibrationRunPlan["preFlightSkips"][number][] = [];
  let executableInvocations = 0;

  for (const benchmarkId of benchmarkIds) {
    const bc = getBenchmarkCase(benchmarkId)!;
    for (const model of models) {
      const executionProfile = benchmarkCaseUsesOsArtifactPipeline(bc)
        ? BENCHMARK_OS_EXECUTOR_PROFILE
        : BENCHMARK_EXECUTOR_PROFILE;
      const verdict = checkBenchmarkCompatibility({
        benchmarkCase: bc,
        modelId: model.modelId,
        executionProfile,
      });
      if (verdict.skipExecution) {
        preFlightSkips.push(
          Object.freeze({
            benchmarkId,
            modelId: model.modelId,
            outcome: verdict.outcomeIfSkipped,
            reasons: verdict.reasons,
          }),
        );
      } else {
        executableInvocations += repeatConfig.repeatCount;
      }
    }
  }

  const plan = planBenchmarkInvocations({
    benchmarkIds,
    models,
    repeatCount: repeatConfig.repeatCount,
    budget: PILOT_BENCHMARK_BUDGET,
  });

  assertBenchmarkBudget(plan, PILOT_BENCHMARK_BUDGET);

  return Object.freeze({
    models,
    benchmarkIds,
    repeatConfig,
    plan,
    preFlightSkips: Object.freeze(preFlightSkips),
    executableInvocations,
  });
}

export function formatCalibrationRunPlan(plan: CalibrationRunPlan): string {
  const lines = [
    "Calibration execution plan (safe — no secrets):",
    "",
    "Models:",
    ...plan.models.map((m) => `  - ${m.providerId} / ${m.modelId}`),
    "",
    "Benchmark cases:",
    ...plan.benchmarkIds.map((id) => `  - ${id}`),
    "",
    `Planned matrix invocations: ${plan.plan.totalInvocations}`,
    `Expected API calls (after pre-flight): ${plan.executableInvocations}`,
    `Pre-flight skips (no API call): ${plan.preFlightSkips.length}`,
    `Budget limit: ${PILOT_BENCHMARK_BUDGET.maxInvocations}`,
  ];

  if (plan.preFlightSkips.length > 0) {
    lines.push("", "Pre-flight skips:");
    for (const s of plan.preFlightSkips) {
      lines.push(`  - ${s.benchmarkId} × ${s.modelId} → ${s.outcome}`);
    }
  }

  return lines.join("\n");
}
