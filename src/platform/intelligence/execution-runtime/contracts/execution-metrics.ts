/**
 * Execution metrics tracked by the monitor.
 */

import type { ExecutionState } from "./execution-state";

export interface ExecutionMetrics {
  readonly progress: number;
  readonly durationMs: number;
  readonly retries: number;
  readonly state: ExecutionState;
  readonly health: "healthy" | "degraded" | "unhealthy";
  readonly startedAt?: string;
  readonly updatedAt: string;
  readonly completedAt?: string;
}
