/**
 * Default SDK retry engine.
 *
 * Purpose: Retry SDK operations. Independent of Runtime and Transport retry.
 * Responsibilities: Attempt loop with strategy-based backoff.
 * Usage: Injected into the SDK engine.
 * Future Extension: Jitter, per-error budgets.
 */

import type { IntelligenceError } from "../../../shared/errors";
import type { Result } from "../../../shared/result";
import type { SdkRetryPolicy } from "../contracts/policies";
import type { ISdkRetryEngine, SdkRetryOutcome } from "../interfaces/engines";

export class DefaultSdkRetryEngine implements ISdkRetryEngine {
  constructor(
    private readonly sleep: (ms: number) => Promise<void> = () => Promise.resolve()
  ) {}

  async execute<T>(
    operation: (attempt: number) => Promise<Result<T>>,
    policy: SdkRetryPolicy,
    isRetryable: (error: IntelligenceError) => boolean
  ): Promise<SdkRetryOutcome<T>> {
    const maxAttempts = Math.max(1, policy.maxAttempts);
    let attempt = 0;
    let last: Result<T> | undefined;

    while (attempt < maxAttempts) {
      attempt += 1;
      last = await operation(attempt);
      if (last.ok) {
        return { result: last, attempts: attempt, retries: attempt - 1 };
      }
      if (!isRetryable(last.error) || attempt >= maxAttempts) {
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

  private delayFor(policy: SdkRetryPolicy, attempt: number): number {
    if (policy.strategy === "none") return 0;
    const base =
      policy.strategy === "exponential"
        ? policy.baseDelayMs * 2 ** (attempt - 1)
        : policy.baseDelayMs;
    return policy.maxDelayMs ? Math.min(base, policy.maxDelayMs) : base;
  }
}
