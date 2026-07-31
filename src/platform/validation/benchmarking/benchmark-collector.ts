/**
 * Benchmark collector — aggregates latency, cost, retry metrics from validation runs.
 */

import type { LoadTestMetrics } from "../contracts";

export interface PerformanceBenchmark {
  readonly averageLatencyMs: number;
  readonly p95LatencyMs: number;
  readonly p99LatencyMs: number;
  readonly queueWaitMs: number;
  readonly providerLatencyMs: number;
  readonly successRate: number;
  readonly executionCount: number;
}

export function fromLoadMetrics(metrics: LoadTestMetrics): PerformanceBenchmark {
  return {
    averageLatencyMs: metrics.averageLatencyMs,
    p95LatencyMs: metrics.p95LatencyMs,
    p99LatencyMs: metrics.p99LatencyMs,
    queueWaitMs: metrics.queueWaitMs,
    providerLatencyMs: metrics.providerLatencyMs,
    successRate: metrics.successRate,
    executionCount: metrics.executionCount,
  };
}

export function aggregateScenarioLatencies(
  samples: readonly number[]
): Pick<PerformanceBenchmark, "averageLatencyMs" | "p95LatencyMs" | "p99LatencyMs"> {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length || 1;
  const sum = sorted.reduce((a, b) => a + b, 0);
  const p = (pct: number) => sorted[Math.min(n - 1, Math.floor((pct / 100) * n))] ?? 0;
  return {
    averageLatencyMs: Number((sum / n).toFixed(2)),
    p95LatencyMs: p(95),
    p99LatencyMs: p(99),
  };
}
