/**
 * Timeout engine port.
 *
 * Purpose: Resolve timeout budgets and race work against a deadline.
 * Responsibilities: Provide execution/streaming/queue timeouts; wrap promises.
 * Usage: Consulted by the execution pipeline.
 * Future Extension: Adaptive timeouts based on provider health.
 */

import type { Result } from "../../../shared/result";
import type { TimeoutPolicy } from "../contracts/timeout-policy";

export interface ITimeoutEngine {
  resolveExecutionTimeoutMs(policy: TimeoutPolicy): number;
  resolveStreamingTimeoutMs(policy: TimeoutPolicy): number;
  resolveQueueTimeoutMs(policy: TimeoutPolicy): number;

  /**
   * Resolve to the work's value, or fail with a TimeoutError after timeoutMs.
   */
  withTimeout<T>(
    work: Promise<T>,
    timeoutMs: number,
    kind: "execution" | "streaming" | "queue"
  ): Promise<Result<T>>;
}
