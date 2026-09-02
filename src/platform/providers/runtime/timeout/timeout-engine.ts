/**
 * Timeout engine.
 *
 * Purpose: Resolve timeout budgets and race work against a deadline.
 * Responsibilities: Provide execution/streaming/queue timeouts; wrap promises.
 * Usage: Consulted by the execution pipeline.
 * Future Extension: Adaptive timeouts based on provider health.
 */

import { failure, success } from "../../../core/result";
import type { Result } from "../../../core/result";
import type { TimeoutPolicy } from "../contracts/timeout-policy";
import { ProviderExecutionTimeoutError } from "../errors";
import type { ITimeoutEngine } from "../interfaces/timeout-engine";

export class TimeoutEngine implements ITimeoutEngine {
  resolveExecutionTimeoutMs(policy: TimeoutPolicy): number {
    return Math.max(0, policy.executionTimeoutMs);
  }

  resolveStreamingTimeoutMs(policy: TimeoutPolicy): number {
    return Math.max(
      0,
      policy.streamingTimeoutMs ?? policy.executionTimeoutMs
    );
  }

  resolveQueueTimeoutMs(policy: TimeoutPolicy): number {
    return Math.max(0, policy.queueTimeoutMs ?? 0);
  }

  async withTimeout<T>(
    work: Promise<T>,
    timeoutMs: number,
    kind: "execution" | "streaming" | "queue"
  ): Promise<Result<T>> {
    if (timeoutMs <= 0) {
      const value = await work;
      return success(value);
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<Result<T>>((resolve) => {
      timer = setTimeout(() => {
        resolve(
          failure(
            new ProviderExecutionTimeoutError(`${kind} timed out`, {
              kind,
              timeoutMs,
            })
          )
        );
      }, timeoutMs);
      if (typeof timer.unref === "function") {
        timer.unref();
      }
    });

    const wrapped = work.then((value) => success(value));
    const result = await Promise.race([wrapped, timeout]);
    if (timer) {
      clearTimeout(timer);
    }
    return result;
  }
}
