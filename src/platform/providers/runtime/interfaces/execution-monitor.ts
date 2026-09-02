/**
 * Execution monitor port.
 *
 * Purpose: Track phase timings and counters for a single execution.
 * Responsibilities: Mark lifecycle phase boundaries; expose statistics.
 * Usage: One monitor per session, owned by the session.
 * Future Extension: Telemetry export hooks.
 */

import type { ProviderExecutionStatistics } from "../contracts/provider-execution-metadata";

export interface IExecutionMonitor {
  readonly statistics: ProviderExecutionStatistics;
  markEnqueued(): void;
  markDequeued(): void;
  markDispatchStart(): void;
  markDispatchEnd(): void;
  markExecutionStart(): void;
  markExecutionEnd(): void;
  markStreamingStart(): void;
  markStreamingEnd(): void;
  markCompleted(): void;
  recordRetry(): void;
  recordTimeout(): void;
  recordStreamingChunk(): void;
  setAttempts(attempts: number): void;
  snapshot(): ProviderExecutionStatistics;
}
