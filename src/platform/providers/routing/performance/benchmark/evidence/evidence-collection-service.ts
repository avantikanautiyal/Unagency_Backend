/**
 * Step 8 — Controlled evidence collection orchestrator.
 */

import type { BenchmarkModelTarget, BenchmarkStrategy } from "../contracts/benchmark-case";
import { DEFAULT_BENCHMARK_STRATEGY } from "../contracts/benchmark-case";
import type { IBenchmarkPerformanceRecordStore } from "../persistence/benchmark-record-store";
import { defaultBenchmarkPerformanceRecordStore } from "../persistence/benchmark-record-store";
import type { IModelPerformanceStore } from "../../interfaces/model-performance-store";
import { runBenchmark, type BenchmarkModelExecutor, type BenchmarkRunResult } from "../engine/benchmark-runner";
import {
  buildEvidenceMatrix,
  formatEvidenceMatrixPlan,
  assertEvidenceCollectionBudget,
  type EvidenceMatrixScope,
  type EvidenceMatrixPlan,
} from "./evidence-matrix";
import {
  DEFAULT_EVIDENCE_COLLECTION_BUDGET,
  type EvidenceCollectionBudget,
} from "./evidence-collection-config";
import type { BenchmarkRepeatConfig } from "../contracts/benchmark-execution-config";

export type EvidenceCollectionInput = EvidenceMatrixScope & {
  readonly organizationId: string;
  readonly strategy?: BenchmarkStrategy;
  readonly knowledgeVersion?: string;
  readonly budget?: EvidenceCollectionBudget;
  readonly repeatConfig?: BenchmarkRepeatConfig;
  readonly dryRun?: boolean;
  readonly executeModel?: BenchmarkModelExecutor;
  readonly maxConcurrentExecutions?: number;
};

export type EvidenceCollectionOutput = {
  readonly plan: EvidenceMatrixPlan;
  readonly dryRun: boolean;
  readonly results: readonly BenchmarkRunResult[];
  readonly insertedCount: number;
  readonly duplicateCount: number;
  readonly failedCount: number;
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

export async function collectEvidence(
  input: EvidenceCollectionInput,
  deps?: {
    readonly recordStore?: IBenchmarkPerformanceRecordStore;
    readonly performanceStore?: IModelPerformanceStore;
  },
): Promise<EvidenceCollectionOutput> {
  const store = deps?.recordStore ?? defaultBenchmarkPerformanceRecordStore;
  const budget = input.budget ?? DEFAULT_EVIDENCE_COLLECTION_BUDGET;
  const plan = buildEvidenceMatrix(input);

  assertEvidenceCollectionBudget(plan, budget);

  if (input.dryRun === true) {
    console.log(formatEvidenceMatrixPlan(plan));
    return Object.freeze({
      plan,
      dryRun: true,
      results: Object.freeze([]),
      insertedCount: 0,
      duplicateCount: 0,
      failedCount: 0,
    });
  }

  if (!input.executeModel) {
    throw new Error("Evidence collection requires executeModel unless dryRun=true");
  }

  const concurrency = Math.min(
    input.maxConcurrentExecutions ?? budget.maxConcurrentExecutions,
    plan.cells.length,
  );

  const tasks = plan.cells.map((cell) => async () => {
    try {
      return await runBenchmark(
        {
          benchmarkId: cell.benchmarkId,
          model: cell.model,
          organizationId: input.organizationId,
          strategy: cell.strategy ?? input.strategy ?? DEFAULT_BENCHMARK_STRATEGY,
          knowledgeVersion: cell.knowledgeVersion ?? input.knowledgeVersion,
          executeModel: input.executeModel!,
        },
        { recordStore: store, performanceStore: deps?.performanceStore },
      );
    } catch (error) {
      return Object.freeze({
        record: undefined as never,
        conditions: undefined as never,
        error: error instanceof Error ? error.message : String(error),
      }) as unknown as BenchmarkRunResult;
    }
  });

  const rawResults = await runWithConcurrency(tasks, concurrency);
  const results = rawResults.filter((r) => r?.record != null);
  let insertedCount = 0;
  let duplicateCount = 0;

  for (const r of results) {
    const status = await store.get(r.record.performanceRecordId);
    if (status) duplicateCount++;
    else insertedCount++;
  }

  return Object.freeze({
    plan,
    dryRun: false,
    results: Object.freeze(results),
    insertedCount,
    duplicateCount,
    failedCount: plan.cells.length - results.length,
  });
}

export function planEvidenceCollection(input: EvidenceMatrixScope): EvidenceMatrixPlan {
  return buildEvidenceMatrix(input);
}
