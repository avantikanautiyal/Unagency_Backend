/**
 * Step 9 — Controlled experiment execution orchestrator.
 * Reuses runBenchmark — does not create another execution engine.
 */

import type { BenchmarkModelExecutor, BenchmarkRunResult } from "../../engine/benchmark-runner";
import { runBenchmark } from "../../engine/benchmark-runner";
import type { IBenchmarkPerformanceRecordStore } from "../../persistence/benchmark-record-store";
import { defaultBenchmarkPerformanceRecordStore } from "../../persistence/benchmark-record-store";
import type { IModelPerformanceStore } from "../../../interfaces/model-performance-store";
import type { ExperimentMatrixInput } from "../contracts/experiment-definition";
import type { ExperimentStatus } from "../contracts/experiment-status";
import {
  buildExperimentMatrix,
  formatExperimentMatrixPlan,
  type ExperimentMatrixPlan,
} from "../matrix/experiment-matrix";
import {
  assertExperimentBudget,
  formatExperimentBudgetPlan,
  planExperimentBudget,
  type ExperimentBudget,
  DEFAULT_EXPERIMENT_BUDGET,
} from "../budget/experiment-budget";
import { buildExperimentExecutionContext } from "../execution/experiment-context-applicator";
import { toBenchmarkStrategy } from "../contracts/experiment-strategy";
import { knowledgeVersionTag } from "../contracts/knowledge-context";
import {
  buildExperimentRunReport,
  type ExperimentRunReport,
} from "../reporting/experiment-report";
import {
  logExperimentBudget,
  logExperimentCellStarted,
  logExperimentCompleted,
  logExperimentConfiguration,
  logExperimentPerformanceRecord,
  logExperimentStarted,
} from "../logging/experiment-logger";

export type ExperimentExecutionInput = ExperimentMatrixInput & {
  readonly organizationId: string;
  readonly budget?: ExperimentBudget;
  readonly dryRun?: boolean;
  readonly executeModel?: BenchmarkModelExecutor;
  readonly maxConcurrentExecutions?: number;
  readonly estimatedCostPerInvocation?: number;
  readonly experimentProvenance?: Readonly<Record<string, unknown>>;
};

export type ExperimentExecutionOutput = {
  readonly plan: ExperimentMatrixPlan;
  readonly budgetPlan: ReturnType<typeof planExperimentBudget>;
  readonly dryRun: boolean;
  readonly status: ExperimentStatus;
  readonly results: readonly BenchmarkRunResult[];
  readonly report: ExperimentRunReport;
};

async function runWithConcurrency<T>(
  tasks: readonly (() => Promise<T>)[],
  concurrency: number,
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;
  async function worker(): Promise<void> {
    while (index < tasks.length) {
      const current = index++;
      results[current] = await tasks[current]!();
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function wrapExecutorForExperiment(
  base: BenchmarkModelExecutor,
  ctx: ReturnType<typeof buildExperimentExecutionContext>,
): BenchmarkModelExecutor {
  return async (input) => {
    const result = await base({
      ...input,
      benchmarkCase: ctx.benchmarkCase,
      strategy: toBenchmarkStrategy(ctx.strategy),
    });
    return result;
  };
}

export async function runExperiment(
  input: ExperimentExecutionInput,
  deps?: {
    readonly recordStore?: IBenchmarkPerformanceRecordStore;
    readonly performanceStore?: IModelPerformanceStore;
  },
): Promise<ExperimentExecutionOutput> {
  const store = deps?.recordStore ?? defaultBenchmarkPerformanceRecordStore;
  const budget = input.budget ?? DEFAULT_EXPERIMENT_BUDGET;
  const plan = buildExperimentMatrix(input);
  const budgetPlan = planExperimentBudget({
    matrix: plan,
    budget,
    estimatedCostPerInvocation: input.estimatedCostPerInvocation,
  });

  logExperimentStarted({ experimentId: input.experimentId, status: "PLANNED", plan });
  logExperimentConfiguration(plan);
  logExperimentBudget(budgetPlan);

  if (input.dryRun === true) {
    console.log(formatExperimentMatrixPlan(plan));
    console.log(formatExperimentBudgetPlan(budgetPlan));
    const report = buildExperimentRunReport({
      experimentId: input.experimentId,
      experimentVersion: plan.experimentVersion,
      status: "PLANNED",
      plan,
      budget: budgetPlan,
      records: [],
    });
    return Object.freeze({
      plan,
      budgetPlan,
      dryRun: true,
      status: "PLANNED",
      results: Object.freeze([]),
      report,
    });
  }

  assertExperimentBudget({
    matrix: plan,
    budget,
    estimatedCostPerInvocation: input.estimatedCostPerInvocation,
  });

  if (!input.executeModel) {
    throw new Error("Experiment execution requires executeModel unless dryRun=true");
  }

  const concurrency = Math.min(
    input.maxConcurrentExecutions ?? budget.maxConcurrentExecutions,
    plan.executableCells.length,
  );

  const tasks = plan.executableCells.map((cell) => async () => {
    logExperimentCellStarted(cell);
    const ctx = buildExperimentExecutionContext({
      benchmarkCase: cell.benchmarkCase,
      strategy: cell.strategy,
      knowledgeContext: cell.knowledgeContext,
      experimentId: input.experimentId,
      experimentVersion: plan.experimentVersion,
    });
    const executor = wrapExecutorForExperiment(input.executeModel!, ctx);
    const knowledgeTag = knowledgeVersionTag(cell.knowledgeContext);

    const result = await runBenchmark(
      {
        benchmarkId: cell.benchmarkId,
        model: cell.model,
        organizationId: input.organizationId,
        strategy: toBenchmarkStrategy(cell.strategy),
        knowledgeVersion: knowledgeTag,
        knowledgeId: cell.knowledgeContext.knowledgeId,
        knowledgeFingerprint: cell.knowledgeContext.contentFingerprint,
        experimentId: input.experimentId,
        experimentVersion: plan.experimentVersion,
        executeModel: executor,
      },
      { recordStore: store, performanceStore: deps?.performanceStore },
    );

    logExperimentPerformanceRecord(result.record);
    return result;
  });

  const rawResults = await runWithConcurrency(tasks, concurrency);
  const results = rawResults.filter((r) => r?.record != null);
  const records = results.map((r) => r.record);

  let status: ExperimentStatus = "COMPLETED";
  if (results.length === 0 && plan.executableCells.length > 0) status = "BLOCKED";
  else if (results.length < plan.executableCells.length) status = "PARTIAL";
  else if (plan.skippedCells.length > 0 && results.length > 0) status = "PARTIAL";

  logExperimentCompleted({
    experimentId: input.experimentId,
    status,
    executed: results.length,
    failed: plan.executableCells.length - results.length,
    records: records.length,
  });

  const report = buildExperimentRunReport({
    experimentId: input.experimentId,
    experimentVersion: plan.experimentVersion,
    status,
    plan,
    budget: budgetPlan,
    records,
  });

  return Object.freeze({
    plan,
    budgetPlan,
    dryRun: false,
    status,
    results: Object.freeze(results),
    report,
  });
}

export function planExperiment(input: ExperimentMatrixInput): ExperimentMatrixPlan {
  return buildExperimentMatrix(input);
}
