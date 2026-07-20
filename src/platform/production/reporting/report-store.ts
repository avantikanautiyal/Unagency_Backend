/**
 * In-memory report / benchmark store for production validation runs.
 */

import type { BenchmarkResult } from "../contracts/metrics";
import type { ProductionValidationReport } from "../contracts/result";

export class InMemoryProductionReportStore {
  private readonly reports: ProductionValidationReport[] = [];
  private readonly benchmarks: BenchmarkResult[] = [];

  save(report: ProductionValidationReport): void {
    this.reports.push(report);
    this.benchmarks.push(report.benchmark);
  }

  list(): readonly ProductionValidationReport[] {
    return [...this.reports];
  }

  listBenchmarks(): readonly BenchmarkResult[] {
    return [...this.benchmarks];
  }

  latest(): ProductionValidationReport | undefined {
    return this.reports[this.reports.length - 1];
  }

  clear(): void {
    this.reports.length = 0;
    this.benchmarks.length = 0;
  }
}
