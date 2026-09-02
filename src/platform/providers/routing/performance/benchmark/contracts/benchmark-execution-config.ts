/**
 * Step 4A — Controlled benchmark execution configuration.
 */

export const BENCHMARK_EXECUTION_MODE = "benchmark" as const;

export type BenchmarkExecutionMode = typeof BENCHMARK_EXECUTION_MODE;

export type BenchmarkBudgetConfig = {
  /** Maximum provider invocations per run (benchmark × model × repeat). */
  readonly maxInvocations: number;
  /** Maximum estimated cost in USD; null = no cost limit. */
  readonly maxEstimatedCostUsd?: number | null;
  /** Require explicit override when invocations exceed this threshold. */
  readonly largeRunThreshold: number;
  readonly allowLargeRunOverride?: boolean;
};

export const DEFAULT_BENCHMARK_BUDGET: BenchmarkBudgetConfig = Object.freeze({
  maxInvocations: 50,
  maxEstimatedCostUsd: null,
  largeRunThreshold: 20,
  allowLargeRunOverride: false,
});

export const PILOT_BENCHMARK_BUDGET: BenchmarkBudgetConfig = Object.freeze({
  maxInvocations: 12,
  maxEstimatedCostUsd: null,
  largeRunThreshold: 12,
  allowLargeRunOverride: true,
});

export type BenchmarkRepeatConfig = {
  readonly repeatCount: number;
  readonly nondeterministic: boolean;
  readonly seed?: number;
  readonly temperature?: number;
};

export const DEFAULT_REPEAT_CONFIG: BenchmarkRepeatConfig = Object.freeze({
  repeatCount: 1,
  nondeterministic: true,
});

export type BenchmarkInvocationPlan = {
  readonly benchmarkCount: number;
  readonly modelCount: number;
  readonly repeatCount: number;
  readonly totalInvocations: number;
  readonly exceedsLargeRunThreshold: boolean;
  readonly withinMaxInvocations: boolean;
};

export function planBenchmarkInvocations(input: {
  readonly benchmarkIds: readonly string[];
  readonly models: readonly unknown[];
  readonly repeatCount?: number;
  readonly budget?: BenchmarkBudgetConfig;
}): BenchmarkInvocationPlan {
  const repeatCount = Math.max(1, input.repeatCount ?? 1);
  const benchmarkCount = input.benchmarkIds.length;
  const modelCount = input.models.length;
  const totalInvocations = benchmarkCount * modelCount * repeatCount;
  const budget = input.budget ?? DEFAULT_BENCHMARK_BUDGET;

  return Object.freeze({
    benchmarkCount,
    modelCount,
    repeatCount,
    totalInvocations,
    exceedsLargeRunThreshold: totalInvocations > budget.largeRunThreshold,
    withinMaxInvocations: totalInvocations <= budget.maxInvocations,
  });
}

export function assertBenchmarkBudget(
  plan: BenchmarkInvocationPlan,
  budget: BenchmarkBudgetConfig = DEFAULT_BENCHMARK_BUDGET,
): void {
  const withinMaxInvocations = plan.totalInvocations <= budget.maxInvocations;
  const exceedsLargeRunThreshold = plan.totalInvocations > budget.largeRunThreshold;
  if (!withinMaxInvocations) {
    throw new Error(
      `Benchmark budget exceeded: ${plan.totalInvocations} invocations planned (max ${budget.maxInvocations}). ` +
        `Reduce benchmarks, models, or repeatCount.`,
    );
  }
  if (exceedsLargeRunThreshold && !budget.allowLargeRunOverride) {
    throw new Error(
      `Large benchmark run blocked: ${plan.totalInvocations} invocations (threshold ${budget.largeRunThreshold}). ` +
        `Set allowLargeRunOverride or reduce scope.`,
    );
  }
}
