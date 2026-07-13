/**
 * Execution monitor.
 *
 * Purpose: Track progress, duration, retries, state, health, timestamps.
 * Responsibilities: Update and expose ExecutionMetrics.
 * Usage: Owned by ExecutionSession.
 * Future Extension: Telemetry export.
 */

import type { ExecutionMetrics } from "../contracts/execution-metrics";
import type { ExecutionState } from "../contracts/execution-state";

export interface IExecutionMonitor {
  readonly metrics: ExecutionMetrics;
  markStarted(): void;
  markUpdated(): void;
  markCompleted(): void;
  setState(state: ExecutionState): void;
  setProgress(progress: number): void;
  incrementRetries(): void;
  setHealth(health: ExecutionMetrics["health"]): void;
}

export class ExecutionMonitor implements IExecutionMonitor {
  private progress = 0;
  private retries = 0;
  private state: ExecutionState = "created";
  private health: ExecutionMetrics["health"] = "healthy";
  private startedAt?: string;
  private updatedAt: string;
  private completedAt?: string;

  constructor(private readonly nowIso: () => string) {
    this.updatedAt = nowIso();
  }

  get metrics(): ExecutionMetrics {
    const now = this.nowIso();
    const durationMs = this.startedAt
      ? Date.parse(this.completedAt ?? now) - Date.parse(this.startedAt)
      : 0;

    return {
      progress: this.progress,
      durationMs: Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0,
      retries: this.retries,
      state: this.state,
      health: this.health,
      startedAt: this.startedAt,
      updatedAt: this.updatedAt,
      completedAt: this.completedAt,
    };
  }

  markStarted(): void {
    this.startedAt = this.nowIso();
    this.markUpdated();
  }

  markUpdated(): void {
    this.updatedAt = this.nowIso();
  }

  markCompleted(): void {
    this.completedAt = this.nowIso();
    this.progress = 1;
    this.markUpdated();
  }

  setState(state: ExecutionState): void {
    this.state = state;
    this.markUpdated();
  }

  setProgress(progress: number): void {
    this.progress = Math.min(1, Math.max(0, progress));
    this.markUpdated();
  }

  incrementRetries(): void {
    this.retries += 1;
    this.markUpdated();
  }

  setHealth(health: ExecutionMetrics["health"]): void {
    this.health = health;
    this.markUpdated();
  }
}
