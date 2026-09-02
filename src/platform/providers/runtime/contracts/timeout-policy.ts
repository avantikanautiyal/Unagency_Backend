/**
 * Timeout policy contract.
 *
 * Purpose: Provider-independent timeout configuration.
 * Responsibilities: Describe execution, streaming, and queue timeouts.
 * Usage: Attached to ProviderExecutionRequest; consumed by ITimeoutEngine.
 * Future Extension: Per-phase adaptive timeouts.
 */

export interface TimeoutPolicy {
  /** Maximum time to wait for a single dispatch attempt. */
  readonly executionTimeoutMs: number;
  /** Maximum time to wait for a streaming session to complete. */
  readonly streamingTimeoutMs?: number;
  /** Maximum time an item may wait in the queue before timing out. */
  readonly queueTimeoutMs?: number;
}

export const DEFAULT_TIMEOUT_POLICY: TimeoutPolicy = {
  executionTimeoutMs: 30_000,
};
