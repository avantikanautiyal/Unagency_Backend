/**
 * Step 4A — Controlled real-world benchmark execution service.
 */

import type { BenchmarkModelTarget, BenchmarkStrategy } from "../contracts/benchmark-case";
import {
  runBenchmark,
  runBenchmarkSuite,
  type BenchmarkModelExecutor,
  type BenchmarkRunResult,
} from "../engine/benchmark-runner";
import { DEFAULT_BENCHMARK_STRATEGY } from "../contracts/benchmark-case";
import type { IBenchmarkPerformanceRecordStore } from "../persistence/benchmark-record-store";
import { defaultBenchmarkPerformanceRecordStore } from "../persistence/benchmark-record-store";
import type { IModelPerformanceStore } from "../../interfaces/model-performance-store";
import {
  assertBenchmarkBudget,
  planBenchmarkInvocations,
  PILOT_BENCHMARK_BUDGET,
  DEFAULT_BENCHMARK_BUDGET,
  type BenchmarkBudgetConfig,
  type BenchmarkRepeatConfig,
  DEFAULT_REPEAT_CONFIG,
} from "../contracts/benchmark-execution-config";
import { PILOT_BENCHMARK_IDS, assertPilotBenchmarksAvailable } from "../catalog/benchmark-pilot-catalog";
import { checkComparisonCompatibility } from "../intelligence/comparison-compatibility";
import {
  buildBenchmarkComparisonReport,
  buildBenchmarkRunReport,
  type BenchmarkComparisonReport,
  type BenchmarkRunReport,
  type ModelComparisonEntry,
} from "../reporting/benchmark-run-report";
import { getBenchmarkCase, buildBenchmarkSuites } from "../catalog/benchmark-catalog";
import type {
  BenchmarkProviderExecutorDeps,
  BenchmarkExecutionObservabilityEvent,
} from "../engine/benchmark-provider-executor";
import {
  createBenchmarkProviderExecutor,
  createProductionBenchmarkExecutor,
} from "../engine/benchmark-provider-executor";

export type RealBenchmarkRunInput = {
  readonly benchmarkIds?: readonly string[];
  readonly suiteId?: string;
  readonly pilot?: boolean;
  readonly models: readonly BenchmarkModelTarget[];
  readonly organizationId: string;
  readonly strategy?: BenchmarkStrategy;
  readonly knowledgeVersion?: string;
  readonly repeatConfig?: BenchmarkRepeatConfig;
  readonly budget?: BenchmarkBudgetConfig;
  readonly allowLargeRun?: boolean;
  readonly executeModel?: BenchmarkModelExecutor;
};

export type RealBenchmarkRunOutput = {
  readonly results: readonly BenchmarkRunResult[];
  readonly reports: readonly BenchmarkRunReport[];
  readonly invocationPlan: ReturnType<typeof planBenchmarkInvocations>;
  readonly observability: readonly BenchmarkExecutionObservabilityEvent[];
};

export type RealBenchmarkExecutionService = {
  runControlled(input: RealBenchmarkRunInput): Promise<RealBenchmarkRunOutput>;
  runPilot(input: Omit<RealBenchmarkRunInput, "pilot" | "benchmarkIds">): Promise<RealBenchmarkRunOutput>;
  compareBenchmark(
    benchmarkId: string,
    records: readonly BenchmarkRunResult[],
    baselineRecord?: BenchmarkRunResult,
  ): BenchmarkComparisonReport;
};

export function createRealBenchmarkExecutionService(deps?: {
  readonly recordStore?: IBenchmarkPerformanceRecordStore;
  readonly performanceStore?: IModelPerformanceStore;
  readonly executorDeps?: BenchmarkProviderExecutorDeps;
  readonly useProductionExecutor?: boolean;
}): RealBenchmarkExecutionService {
  const store = deps?.recordStore ?? defaultBenchmarkPerformanceRecordStore;
  const observability: BenchmarkExecutionObservabilityEvent[] = [];

  async function resolveExecutor(
    input: RealBenchmarkRunInput,
  ): Promise<BenchmarkModelExecutor> {
    if (input.executeModel) return input.executeModel;
    if (deps?.executorDeps) {
      return createBenchmarkProviderExecutor({
        ...deps.executorDeps,
        repeatConfig: input.repeatConfig ?? deps.executorDeps.repeatConfig,
        onObservability: (e) => {
          observability.push(e);
          deps.executorDeps?.onObservability?.(e);
        },
      });
    }
    if (deps?.useProductionExecutor) {
      return createProductionBenchmarkExecutor({
        organizationId: input.organizationId,
        repeatConfig: input.repeatConfig,
        onObservability: (e) => observability.push(e),
      });
    }
    throw new Error(
      "Real benchmark execution requires executeModel, executorDeps, or useProductionExecutor",
    );
  }

  return Object.freeze({
    runControlled: async (input) => {
      const benchmarkIds =
        input.pilot || (!input.benchmarkIds?.length && !input.suiteId)
          ? [...PILOT_BENCHMARK_IDS]
          : input.benchmarkIds ?? [];

      if (input.pilot) assertPilotBenchmarksAvailable();

      const repeatCount = input.repeatConfig?.repeatCount ?? DEFAULT_REPEAT_CONFIG.repeatCount;
      const budget = input.budget ?? (input.pilot ? PILOT_BENCHMARK_BUDGET : DEFAULT_BENCHMARK_BUDGET);
      const effectiveBudget =
        input.allowLargeRun && !budget.allowLargeRunOverride
          ? { ...budget, allowLargeRunOverride: true }
          : budget;

      const plan = planBenchmarkInvocations({
        benchmarkIds: benchmarkIds.length > 0 ? benchmarkIds : ["__suite__"],
        models: input.models,
        repeatCount,
        budget: effectiveBudget,
      });

      if (benchmarkIds.length === 0 && input.suiteId) {
        const suitePlan = planBenchmarkInvocations({
          benchmarkIds: ["placeholder"],
          models: input.models,
          repeatCount,
          budget: effectiveBudget,
        });
        assertBenchmarkBudget(
          {
            ...suitePlan,
            totalInvocations: suitePlan.totalInvocations,
          },
          effectiveBudget,
        );
      } else {
        assertBenchmarkBudget(plan, effectiveBudget);
      }

      const executor = await resolveExecutor(input);
      const allResults: BenchmarkRunResult[] = [];

      if (benchmarkIds.length > 0 && !input.suiteId) {
        for (const benchmarkId of benchmarkIds) {
          for (const model of input.models) {
            for (let rep = 0; rep < repeatCount; rep++) {
              const result = await runBenchmark(
                {
                  benchmarkId,
                  model,
                  organizationId: input.organizationId,
                  strategy: input.strategy ?? DEFAULT_BENCHMARK_STRATEGY,
                  knowledgeVersion: input.knowledgeVersion,
                  executeModel: executor,
                },
                { recordStore: store, performanceStore: deps?.performanceStore },
              );
              allResults.push(result);
            }
          }
        }
      } else {
        const suiteBenchmarkIds =
          benchmarkIds.length > 0
            ? benchmarkIds
            : input.suiteId
              ? buildBenchmarkSuites().find((s) => s.suiteId === input.suiteId)?.benchmarkIds ?? []
              : [];

        for (const benchmarkId of suiteBenchmarkIds) {
          for (const model of input.models) {
            for (let rep = 0; rep < repeatCount; rep++) {
              const result = await runBenchmark(
                {
                  benchmarkId,
                  model,
                  organizationId: input.organizationId,
                  strategy: input.strategy ?? DEFAULT_BENCHMARK_STRATEGY,
                  knowledgeVersion: input.knowledgeVersion,
                  executeModel: executor,
                },
                { recordStore: store, performanceStore: deps?.performanceStore },
              );
              allResults.push(result);
            }
          }
        }

        if (suiteBenchmarkIds.length === 0) {
          const suiteResults = await runBenchmarkSuite(
            {
              benchmarkIds: benchmarkIds.length > 0 ? benchmarkIds : undefined,
              suiteId: input.suiteId,
              models: input.models,
              organizationId: input.organizationId,
              strategy: input.strategy,
              knowledgeVersion: input.knowledgeVersion,
              executeModel: executor,
            },
            { recordStore: store, performanceStore: deps?.performanceStore },
          );
          allResults.push(...suiteResults);
        }
      }

      const reports = allResults.map((r) => {
        const bc = getBenchmarkCase(r.record.benchmarkId)!;
        return buildBenchmarkRunReport({ benchmarkCase: bc, record: r.record, conditions: r.conditions });
      });

      return Object.freeze({
        results: Object.freeze(allResults),
        reports: Object.freeze(reports),
        invocationPlan: plan,
        observability: Object.freeze([...observability]),
      });
    },

    runPilot: async (input) =>
      createRealBenchmarkExecutionService(deps).runControlled({
        ...input,
        pilot: true,
        budget: input.budget ?? PILOT_BENCHMARK_BUDGET,
      }),

    compareBenchmark: (benchmarkId, records, baselineRecord) => {
      const scoped = records.filter((r) => r.record.benchmarkId === benchmarkId);
      const baseline = baselineRecord ?? scoped[0];
      const entries: ModelComparisonEntry[] = scoped.map((r) =>
        Object.freeze({
          providerId: r.record.providerId,
          modelId: r.record.modelId,
          modelVersion: r.record.modelVersion,
          hardRequirementPassRate: r.record.hardRequirementPassRate,
          qualityScore: r.record.qualityScore,
          latencyMs: r.record.latencyMs,
          cost: r.record.estimatedCost,
          costAvailable: r.record.costAvailable,
          sampleCount: 1,
          measuredDimensions: r.record.measuredQualityDimensions,
          unmeasuredDimensions: r.record.unmeasuredQualityDimensions,
          failureProfile: r.record.failureCategories,
          compatibility: baseline
            ? checkComparisonCompatibility(baseline.record, r.record)
            : Object.freeze({ compatible: true, reasons: Object.freeze([]) }),
          reliabilityStatus: r.record.reliabilityStatus,
        }),
      );
      const bc = getBenchmarkCase(benchmarkId);
      return buildBenchmarkComparisonReport({
        benchmarkId,
        scope: `${bc?.service ?? "unknown"}/${bc?.industry ?? "general"}/${bc?.complexity ?? "medium"}`,
        entries,
      });
    },
  });
}

export const defaultRealBenchmarkExecutionService = createRealBenchmarkExecutionService();
