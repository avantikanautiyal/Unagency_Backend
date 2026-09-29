/**
 * Provider runtime port.
 *
 * Purpose: Execute provider requests through the complete runtime lifecycle.
 * Responsibilities: Create sessions, queue, dispatch, retry, timeout, cancel,
 *   stream, guard via circuit breaker, and record metrics.
 * Usage: The single entry point for provider execution — no vendor SDKs.
 * Future Extension: Provider adapters plug in via IProviderDispatcher.
 */

import type { Result } from "../../../core/result";
import type { ProviderExecutionRequest } from "../contracts/provider-execution-request";
import type { ProviderExecutionResult } from "../contracts/provider-execution-response";
import type { ProviderExecutionSnapshot } from "../contracts/provider-session";
import type { ProviderRuntimeSnapshot } from "../contracts/runtime-metrics";
import type { CircuitBreakerState } from "../contracts/circuit-breaker";
import type { ProviderHealthSnapshot } from "../diagnostics/provider-health-snapshot";

export interface IProviderRuntime {
  /**
   * Execute a provider request. Resolves when the session reaches a terminal
   * status (completed/failed/cancelled/timed_out).
   */
  execute(
    request: ProviderExecutionRequest
  ): Promise<Result<ProviderExecutionResult>>;

  cancel(sessionId: string, reason?: string): Promise<Result<void>>;

  getSession(sessionId: string): Result<ProviderExecutionSnapshot>;

  getRuntimeSnapshot(): ProviderRuntimeSnapshot;

  /**
   * Whether the per-provider circuit breaker currently permits dispatch.
   * Used by Direct failover to skip OPEN providers before calling execute.
   */
  canDispatchToProvider(providerId: string): boolean;

  /** Observability — in-memory breaker snapshots (not Redis-backed). */
  getCircuitBreakerSnapshots(): readonly CircuitBreakerState[];

  /** Safe provider-health snapshot for internal admin/debugging. */
  getProviderHealthSnapshots(): readonly ProviderHealthSnapshot[];

  dispose(): Promise<void>;
}
