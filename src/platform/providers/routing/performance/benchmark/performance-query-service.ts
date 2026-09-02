/**
 * Domain query service for benchmark performance evidence.
 */

import type { BenchmarkCase, BenchmarkSuite } from "./contracts/benchmark-case";
import type { ComparisonCompatibility } from "./contracts/model-performance-record";
import {
  buildBenchmarkCatalog,
  buildBenchmarkSuites,
  getBenchmarkCase,
  listBenchmarkCases,
} from "./catalog/benchmark-catalog";
import type {
  IBenchmarkPerformanceRecordStore,
  PerformanceRecordQuery,
} from "./persistence/benchmark-record-store";
import { defaultBenchmarkPerformanceRecordStore } from "./persistence/benchmark-record-store";
import { checkComparisonCompatibility } from "./intelligence/comparison-compatibility";
import {
  createPerformanceIntelligenceService,
  type PerformanceIntelligenceService,
} from "./evidence/performance-intelligence-service";
import {
  runBenchmark,
  runBenchmarkSuite,
  type BenchmarkModelExecutor,
} from "./engine/benchmark-runner";

export type PerformanceQueryService = PerformanceIntelligenceService & {
  listBenchmarks(filter?: Parameters<typeof listBenchmarkCases>[0]): readonly BenchmarkCase[];
  listSuites(): readonly BenchmarkSuite[];
  getBenchmark(benchmarkId: string): BenchmarkCase | undefined;
  queryRecords(query: PerformanceRecordQuery): Promise<readonly ModelPerformanceRecord[]>;
  getRecord(recordId: string): Promise<ModelPerformanceRecord | undefined>;
  compareCompatibility(
    recordA: ModelPerformanceRecord,
    recordB: ModelPerformanceRecord,
  ): ComparisonCompatibility;
  runSingle(
    input: Parameters<typeof runBenchmark>[0],
  ): ReturnType<typeof runBenchmark>;
  runSuite(
    input: Parameters<typeof runBenchmarkSuite>[0],
  ): ReturnType<typeof runBenchmarkSuite>;
};

export function createPerformanceQueryService(deps?: {
  readonly recordStore?: IBenchmarkPerformanceRecordStore;
  readonly executeModel?: BenchmarkModelExecutor;
}): PerformanceQueryService {
  const store = deps?.recordStore ?? defaultBenchmarkPerformanceRecordStore;
  const intelligence = createPerformanceIntelligenceService({ recordStore: store });

  return Object.freeze({
    ...intelligence,
    listBenchmarks: (filter) => listBenchmarkCases(filter),
    listSuites: () => buildBenchmarkSuites(),
    getBenchmark: (benchmarkId) => getBenchmarkCase(benchmarkId),
    queryRecords: (query) => store.query(query),
    getRecord: (recordId) => store.get(recordId),
    compareCompatibility: checkComparisonCompatibility,
    runSingle: (input) =>
      runBenchmark(
        {
          ...input,
          executeModel: input.executeModel ?? deps?.executeModel ?? stubExecutor,
        },
        { recordStore: store },
      ),
    runSuite: (input) =>
      runBenchmarkSuite(
        {
          ...input,
          executeModel: input.executeModel ?? deps?.executeModel ?? stubExecutor,
        },
        { recordStore: store },
      ),
  });
}

async function stubExecutor(): Promise<{
  preview: string;
  latencyMs: number;
}> {
  return { preview: "", latencyMs: 0 };
}

export const defaultPerformanceQueryService = createPerformanceQueryService();

export function benchmarksApiPayload(): {
  readonly version: string;
  readonly suites: readonly BenchmarkSuite[];
  readonly cases: readonly BenchmarkCase[];
  readonly totalCases: number;
} {
  const cases = buildBenchmarkCatalog();
  return Object.freeze({
    version: "1.0.0",
    suites: buildBenchmarkSuites(),
    cases,
    totalCases: cases.length,
  });
}
