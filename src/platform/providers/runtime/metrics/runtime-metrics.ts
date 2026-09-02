/**
 * Provider runtime metrics.
 *
 * Purpose: Aggregate per-execution statistics into runtime-level metrics.
 * Responsibilities: Record terminal results; expose statistics and snapshot.
 * Usage: The runtime records every result and serves snapshots.
 * Future Extension: Latency percentiles, per-provider breakdowns.
 */

import type { ProviderExecutionResult } from "../contracts/provider-execution-response";
import {
  EMPTY_RUNTIME_STATISTICS,
  type ProviderRuntimeSnapshot,
  type ProviderRuntimeStatistics,
} from "../contracts/runtime-metrics";
import type { IProviderRuntimeMetrics } from "../interfaces/runtime-metrics";

export class ProviderRuntimeMetrics implements IProviderRuntimeMetrics {
  private totalExecutions = 0;
  private completed = 0;
  private failed = 0;
  private cancelled = 0;
  private timedOut = 0;
  private retries = 0;
  private timeouts = 0;
  private streamingExecutions = 0;
  private totalDurationMs = 0;

  constructor(private readonly nowIso: () => string = () => new Date().toISOString()) {}

  get statistics(): ProviderRuntimeStatistics {
    return this.buildStatistics();
  }

  record(result: ProviderExecutionResult): void {
    this.totalExecutions += 1;
    this.totalDurationMs += result.statistics.totalMs;
    this.retries += result.statistics.retries;
    this.timeouts += result.statistics.timeouts;
    if (result.statistics.streamingChunks > 0) {
      this.streamingExecutions += 1;
    }

    switch (result.status) {
      case "completed":
        this.completed += 1;
        break;
      case "failed":
        this.failed += 1;
        break;
      case "cancelled":
        this.cancelled += 1;
        break;
      case "timed_out":
        this.timedOut += 1;
        break;
      default:
        break;
    }
  }

  snapshot(activeSessions: number, queuedSessions: number): ProviderRuntimeSnapshot {
    return {
      statistics: this.buildStatistics(),
      activeSessions,
      queuedSessions,
      capturedAt: this.nowIso(),
    };
  }

  private buildStatistics(): ProviderRuntimeStatistics {
    return {
      ...EMPTY_RUNTIME_STATISTICS,
      totalExecutions: this.totalExecutions,
      completed: this.completed,
      failed: this.failed,
      cancelled: this.cancelled,
      timedOut: this.timedOut,
      retries: this.retries,
      timeouts: this.timeouts,
      streamingExecutions: this.streamingExecutions,
      totalDurationMs: this.totalDurationMs,
      averageDurationMs:
        this.totalExecutions === 0
          ? 0
          : this.totalDurationMs / this.totalExecutions,
    };
  }
}
