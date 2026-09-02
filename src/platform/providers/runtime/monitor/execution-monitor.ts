/**
 * Provider execution monitor.
 *
 * Purpose: Track phase timings and counters for a single execution.
 * Responsibilities: Mark lifecycle boundaries; expose ProviderExecutionStatistics.
 * Usage: One monitor per session.
 * Future Extension: Telemetry export hooks.
 */

import {
  EMPTY_EXECUTION_STATISTICS,
  type ProviderExecutionStatistics,
} from "../contracts/provider-execution-metadata";
import type { IExecutionMonitor } from "../interfaces/execution-monitor";

export class ProviderExecutionMonitor implements IExecutionMonitor {
  private readonly nowMs: () => number;

  private enqueuedAt?: number;
  private dequeuedAt?: number;
  private dispatchStartedAt?: number;
  private executionStartedAt?: number;
  private streamingStartedAt?: number;
  private completedAt?: number;
  private readonly createdAt: number;

  private queueWaitMs = 0;
  private dispatchMs = 0;
  private executionMs = 0;
  private streamingMs = 0;
  private attempts = 0;
  private retries = 0;
  private timeouts = 0;
  private streamingChunks = 0;

  constructor(nowMs: () => number = () => Date.now()) {
    this.nowMs = nowMs;
    this.createdAt = nowMs();
  }

  get statistics(): ProviderExecutionStatistics {
    return this.snapshot();
  }

  markEnqueued(): void {
    this.enqueuedAt = this.nowMs();
  }

  markDequeued(): void {
    this.dequeuedAt = this.nowMs();
    if (this.enqueuedAt !== undefined) {
      this.queueWaitMs = Math.max(0, this.dequeuedAt - this.enqueuedAt);
    }
  }

  markDispatchStart(): void {
    this.dispatchStartedAt = this.nowMs();
  }

  markDispatchEnd(): void {
    if (this.dispatchStartedAt !== undefined) {
      this.dispatchMs += Math.max(0, this.nowMs() - this.dispatchStartedAt);
    }
  }

  markExecutionStart(): void {
    this.executionStartedAt = this.nowMs();
  }

  markExecutionEnd(): void {
    if (this.executionStartedAt !== undefined) {
      this.executionMs += Math.max(0, this.nowMs() - this.executionStartedAt);
    }
  }

  markStreamingStart(): void {
    this.streamingStartedAt = this.nowMs();
  }

  markStreamingEnd(): void {
    if (this.streamingStartedAt !== undefined) {
      this.streamingMs += Math.max(0, this.nowMs() - this.streamingStartedAt);
    }
  }

  markCompleted(): void {
    this.completedAt = this.nowMs();
  }

  recordRetry(): void {
    this.retries += 1;
  }

  recordTimeout(): void {
    this.timeouts += 1;
  }

  recordStreamingChunk(): void {
    this.streamingChunks += 1;
  }

  setAttempts(attempts: number): void {
    this.attempts = Math.max(0, attempts);
  }

  snapshot(): ProviderExecutionStatistics {
    const end = this.completedAt ?? this.nowMs();
    const start = this.enqueuedAt ?? this.createdAt;
    const totalMs = Math.max(0, end - start);
    return {
      ...EMPTY_EXECUTION_STATISTICS,
      queueWaitMs: this.queueWaitMs,
      dispatchMs: this.dispatchMs,
      executionMs: this.executionMs,
      streamingMs: this.streamingMs,
      totalMs,
      attempts: this.attempts,
      retries: this.retries,
      timeouts: this.timeouts,
      streamingChunks: this.streamingChunks,
    };
  }
}
