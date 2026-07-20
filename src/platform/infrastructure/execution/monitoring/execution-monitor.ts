/**
 * Execution metrics monitor.
 */

import type { ExecutionMetricsSnapshot } from "../contracts/job";
import type { QueueKind } from "../contracts/enums";

export class ExecutionMonitor {
  private retries = 0;
  private failures = 0;
  private completions = 0;
  private cancellations = 0;
  private totalExecutionMs = 0;
  private totalQueueMs = 0;
  private providerTimeMs = 0;
  private completedInWindow = 0;
  private windowStartMs: number;

  constructor(private readonly clockMs: () => number = () => Date.now()) {
    this.windowStartMs = clockMs();
  }

  recordRetry(): void {
    this.retries += 1;
  }

  recordFailure(executionMs: number): void {
    this.failures += 1;
    this.totalExecutionMs += executionMs;
  }

  recordCompletion(executionMs: number, queueMs: number, providerMs = 0): void {
    this.completions += 1;
    this.completedInWindow += 1;
    this.totalExecutionMs += executionMs;
    this.totalQueueMs += queueMs;
    this.providerTimeMs += providerMs;
  }

  recordCancellation(): void {
    this.cancellations += 1;
  }

  snapshot(input: {
    queueLengths: Record<QueueKind, number>;
    workerUtilization: number;
    deadLetterCount: number;
    activeJobs: number;
    nowIso: string;
  }): ExecutionMetricsSnapshot {
    const total = this.completions + this.failures;
    const elapsedMin = Math.max(1 / 60, (this.clockMs() - this.windowStartMs) / 60_000);
    return {
      queueLengths: input.queueLengths,
      workerUtilization: input.workerUtilization,
      retryCount: this.retries,
      failureRate: total === 0 ? 0 : this.failures / total,
      averageExecutionMs: total === 0 ? 0 : this.totalExecutionMs / total,
      averageQueueMs:
        this.completions === 0 ? 0 : this.totalQueueMs / this.completions,
      providerTimeMs: this.providerTimeMs,
      throughputPerMinute: this.completedInWindow / elapsedMin,
      cancellationRate:
        total + this.cancellations === 0
          ? 0
          : this.cancellations / (total + this.cancellations),
      deadLetterCount: input.deadLetterCount,
      activeJobs: input.activeJobs,
      capturedAt: input.nowIso,
    };
  }
}
