/**
 * Provider execution metadata and statistics contracts.
 *
 * Purpose: Immutable per-execution bookkeeping and timing statistics.
 * Responsibilities: Describe attempts, streaming, and phase durations.
 * Usage: Tracked by the monitor; embedded in snapshots and results.
 * Future Extension: Cost/token statistics once adapters report usage.
 */

import type { ProviderId } from "../../../shared/identifiers";

export interface ProviderExecutionMetadata {
  readonly requestId: string;
  readonly sessionId: string;
  readonly providerId: ProviderId;
  readonly attempts: number;
  readonly streamed: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Timing and counter statistics for a single execution.
 */
export interface ProviderExecutionStatistics {
  readonly queueWaitMs: number;
  readonly dispatchMs: number;
  readonly executionMs: number;
  readonly streamingMs: number;
  readonly totalMs: number;
  readonly attempts: number;
  readonly retries: number;
  readonly timeouts: number;
  readonly streamingChunks: number;
}

export const EMPTY_EXECUTION_STATISTICS: ProviderExecutionStatistics = {
  queueWaitMs: 0,
  dispatchMs: 0,
  executionMs: 0,
  streamingMs: 0,
  totalMs: 0,
  attempts: 0,
  retries: 0,
  timeouts: 0,
  streamingChunks: 0,
};
