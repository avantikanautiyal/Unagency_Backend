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
  if (m.includes("provider") || m.includes("rate")) return "provider";
  if (m.includes("fatal") || m.includes("permanent")) return "fatal";
  return "transient";
}
