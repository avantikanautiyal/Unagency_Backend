/**
 * Retry delay calculation.
 */

import type { RetryPolicy } from "../contracts/job";
import type { BackoffFailureClass } from "../contracts/enums";

export function computeRetryDelayMs(policy: RetryPolicy, attempt: number): number {
  const n = Math.max(1, attempt);
  switch (policy.strategy) {
    case "immediate":
      return 0;
    case "linear":
      return Math.min(policy.maxDelayMs, policy.baseDelayMs * n);
    case "exponential":
    default:
      return Math.min(
        policy.maxDelayMs,
        policy.baseDelayMs * Math.pow(2, n - 1)
      );
  }
}

export function isRetryable(
  policy: RetryPolicy,
  failureClass: BackoffFailureClass
): boolean {
  if (failureClass === "fatal" || failureClass === "validation") return false;
  const allowed = policy.retryableClasses ?? ["transient", "timeout", "provider"];
  return allowed.includes(failureClass);
}

export function classifyError(message: string): BackoffFailureClass {
  const m = message.toLowerCase();
  if (m.includes("validat") || m.includes("invalid")) return "validation";
  if (m.includes("timeout") || m.includes("timed out")) return "timeout";
  // Circuit open: recoverable via another provider (Direct failover) or after cooldown.
  // Do not mark fatal — that blocked useful retries while Anthropic cooled down.
  if (
    m.includes("circuit breaker") ||
    m.includes("circuit_open")
  ) {
    return "provider";
  }
  if (
    /\bhttp\s*402\b/.test(m) ||
    m.includes("payment required") ||
    m.includes("insufficient balance") ||
    m.includes("out of credit") ||
    m.includes("insufficient_quota")
  ) {
    return "fatal";
  }
  if (
    m.includes("rate limit") ||
    m.includes("rate_limit") ||
    /\bhttp\s*429\b/.test(m) ||
    m.includes("too many requests")
  ) {
    return "provider";
  }
  if (m.includes("provider") || m.includes("rate")) return "provider";
  if (m.includes("fatal") || m.includes("permanent")) return "fatal";
  return "transient";
}
