/**
 * Runtime-level metrics contracts.
 *
 * Purpose: Aggregate statistics and snapshot across all executions.
 * Responsibilities: Describe counters and a point-in-time runtime snapshot.
 * Usage: Produced by IProviderRuntimeMetrics; queried via the runtime.
 * Future Extension: Percentile latency histograms.
 */

export interface ProviderRuntimeStatistics {
  readonly totalExecutions: number;
  readonly completed: number;
  readonly failed: number;
  readonly cancelled: number;
  readonly timedOut: number;
  readonly retries: number;
  readonly timeouts: number;
  readonly streamingExecutions: number;
  readonly totalDurationMs: number;
  readonly averageDurationMs: number;
}

export interface ProviderRuntimeSnapshot {
  readonly statistics: ProviderRuntimeStatistics;
  readonly activeSessions: number;
  readonly queuedSessions: number;
  readonly capturedAt: string;
}

export const EMPTY_RUNTIME_STATISTICS: ProviderRuntimeStatistics = {
  totalExecutions: 0,
  completed: 0,
  failed: 0,
  cancelled: 0,
  timedOut: 0,
  retries: 0,
  timeouts: 0,
  streamingExecutions: 0,
  totalDurationMs: 0,
  averageDurationMs: 0,
};
