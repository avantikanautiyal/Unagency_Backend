/**
 * Immutable orchestration result.
 */

import type { ExecutionResult } from "../../execution-runtime/contracts/execution-result";
import type { ExecutionSnapshot } from "../../execution-runtime/contracts/execution-snapshot";
import type { ExecutionMetrics } from "../../execution-runtime/contracts/execution-metrics";

export type OrchestrationStatus =
  | "completed"
  | "failed"
  | "cancelled"
  | "partial";

export interface OrchestrationResult {
  readonly orchestrationId: string;
  readonly planId: string;
  readonly status: OrchestrationStatus;
  readonly sessionId?: string;
  readonly aggregated: ExecutionResult | undefined;
  readonly contributions: readonly ExecutionResult[];
  readonly snapshot?: ExecutionSnapshot;
  readonly metrics?: ExecutionMetrics;
  readonly message?: string;
  readonly completedAt: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}
