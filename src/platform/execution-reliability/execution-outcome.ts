/**
 * Framework-level execution outcome contract.
 * Separates application limiting from provider limiting and async unknowns.
 * Independent of service / phase / provider semantic branches.
 */

export type ExecutionReliabilityOutcome =
  | "EXECUTION_PENDING"
  | "USER_CANCELLED"
  | "APPLICATION_RATE_LIMITED"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_QUOTA_EXHAUSTED"
  | "PROVIDER_CONCURRENCY_LIMITED"
  | "PROVIDER_CAPACITY_LIMITED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_OUTCOME_UNKNOWN"
  | "PROVIDER_FAILED"
  | "SUCCEEDED";

export type RateLimitAccountingClass =
  | "USER_REQUEST"
  | "BACKGROUND_POLL"
  | "INTERNAL_ORCHESTRATION"
  | "PROVIDER_OPERATION";

/** Map durable async error codes → typed reliability outcomes. */
export function reliabilityOutcomeFromAsyncErrorCode(
  errorCode: string | undefined | null,
): ExecutionReliabilityOutcome | undefined {
  if (!errorCode) return undefined;
  const c = errorCode.toLowerCase();
  if (c === "provider_submit_stale" || c === "provider_outcome_unknown") {
    return "PROVIDER_OUTCOME_UNKNOWN";
  }
  if (c === "provider_job_timeout" || c === "provider_poll_max_duration") {
    return "PROVIDER_TIMEOUT";
  }
  if (c.includes("rate") && c.includes("limit")) return "PROVIDER_RATE_LIMITED";
  if (c.includes("quota")) return "PROVIDER_QUOTA_EXHAUSTED";
  if (c.includes("concurrency")) return "PROVIDER_CONCURRENCY_LIMITED";
  if (c === "cancelled" || c === "user_cancelled") return "USER_CANCELLED";
  return undefined;
}

/**
 * CRITICAL: unknown / poll-timeout must never become SUCCEEDED and must
 * never imply a new provider submission.
 */
export function mayAutoRetryProviderSubmission(
  outcome: ExecutionReliabilityOutcome,
): boolean {
  return (
    outcome !== "PROVIDER_OUTCOME_UNKNOWN" &&
    outcome !== "EXECUTION_PENDING" &&
    outcome !== "SUCCEEDED" &&
    outcome !== "USER_CANCELLED" &&
    outcome !== "APPLICATION_RATE_LIMITED"
  );
}
