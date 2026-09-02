/**
 * Runtime metrics port.
 *
 * Purpose: Aggregate per-execution statistics into runtime-level metrics.
 * Responsibilities: Record terminal results; expose statistics and snapshot.
 * Usage: The runtime records every result and serves snapshots.
 * Future Extension: Latency percentiles, per-provider breakdowns.
 */

import type { ProviderExecutionResult } from "../contracts/provider-execution-response";
import type {
  ProviderRuntimeSnapshot,
  ProviderRuntimeStatistics,
} from "../contracts/runtime-metrics";

export interface IProviderRuntimeMetrics {
  readonly statistics: ProviderRuntimeStatistics;
  record(result: ProviderExecutionResult): void;
  snapshot(activeSessions: number, queuedSessions: number): ProviderRuntimeSnapshot;
}
