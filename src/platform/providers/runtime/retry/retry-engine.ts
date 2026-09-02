/**
 * Retry engine.
 *
 * Purpose: Compute retry decisions and backoff delays from a RetryPolicy.
 * Responsibilities: Pure, deterministic backoff math for all strategies.
 * Usage: Consulted by the execution pipeline between attempts.
 * Future Extension: Jitter (interface present) and per-error retry rules.
 */

import type { JitterMode } from "../contracts/retry-policy";
import type { RetryPolicy } from "../contracts/retry-policy";
import type {
  IJitterStrategy,
  IRetryEngine,
} from "../interfaces/retry-engine";

/**
 * No-op jitter strategy. Jitter is reserved for a future milestone; the
 * strategy is injectable so the retry engine need not change when it lands.
 */
export class NoJitterStrategy implements IJitterStrategy {
  apply(delayMs: number, _mode: JitterMode): number {
    return delayMs;
  }
}

export class RetryEngine implements IRetryEngine {
  constructor(private readonly jitter: IJitterStrategy = new NoJitterStrategy()) {}

  shouldRetry(policy: RetryPolicy, attempt: number): boolean {
    if (policy.strategy === "none") {
      return false;
    }
    return attempt < Math.max(1, policy.maxAttempts);
  }

  nextDelayMs(policy: RetryPolicy, attempt: number): number {
    const base = Math.max(0, policy.baseDelayMs);
    let delay: number;

    switch (policy.strategy) {
      case "none":
        return 0;
      case "immediate":
        delay = 0;
        break;
      case "fixed":
        delay = base;
        break;
      case "linear":
        delay = base * attempt;
        break;
      case "exponential": {
        const multiplier = policy.multiplier ?? 2;
        delay = base * Math.pow(multiplier, Math.max(0, attempt - 1));
        break;
      }
      default:
        delay = base;
    }

    if (policy.maxDelayMs !== undefined) {
      delay = Math.min(delay, policy.maxDelayMs);
    }

    return this.jitter.apply(delay, policy.jitter ?? "none");
  }
}
