/**
 * Default transport retry engine.
 *
 * Purpose: Retry a transport operation. Independent of Provider Runtime retry.
 * Responsibilities: Attempt loop with strategy-based backoff; report attempts.
 * Usage: Injected into the dispatcher.
 * Future Extension: Jitter, per-error budgets.
 *
 * Backoff delays are applied via an injected `sleep` (noop by default) so no
 * real timers/networking are required.
 */

import type { IntelligenceError } from "../../../shared/errors";
import type { Result } from "../../../shared/result";
import type {
  ITransportRetryEngine,
  RetryOutcome,
  TransportRetryPolicy,
} from "../interfaces/engines";

export class DefaultTransportRetryEngine implements ITransportRetryEngine {
  constructor(
    private readonly sleep: (ms: number) => Promise<void> = () => Promise.resolve()
  ) {}

  async execute<T>(
    operation: (attempt: number) => Promise<Result<T>>,
    policy: TransportRetryPolicy,
    isRetryable: (error: IntelligenceError) => boolean
  ): Promise<RetryOutcome<T>> {
    const maxAttempts = Math.max(1, policy.maxAttempts);
    let attempt = 0;
    let last: Result<T> | undefined;

    while (attempt < maxAttempts) {
      attempt += 1;
      last = await operation(attempt);
      if (last.ok) {
        return { result: last, attempts: attempt, retries: attempt - 1 };
      }
      const retryable = isRetryable(last.error);
      if (!retryable || attempt >= maxAttempts) {
        break;
      }
      await this.sleep(this.delayFor(policy, attempt));
    }

    return {
      result: last as Result<T>,
      attempts: attempt,
      retries: attempt - 1,
    };
  }

  private delayFor(policy: TransportRetryPolicy, attempt: number): number {
    if (policy.strategy === "none") return 0;
    const base =
      policy.strategy === "exponential"
        ? policy.baseDelayMs * 2 ** (attempt - 1)
        : policy.baseDelayMs;
    return policy.maxDelayMs ? Math.min(base, policy.maxDelayMs) : base;
  }
}
