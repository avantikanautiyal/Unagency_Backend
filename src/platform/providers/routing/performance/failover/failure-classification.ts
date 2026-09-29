/**
 * Failover failure classification — reuses CanonicalErrorKind taxonomy.
 */

import type { CanonicalErrorKind } from "../../../adapters/contracts/enums";
import type { PerformanceFailureCategory } from "../contracts/performance-evidence";
import type { ProviderExecutionError } from "../../../runtime/contracts/provider-execution-response";
import type { ProviderExecutionStatus } from "../../../runtime/contracts/provider-execution-status";

/** Categories that typically warrant provider failover. */
export const DEFAULT_FAILOVER_CATEGORIES: ReadonlySet<PerformanceFailureCategory> =
  new Set([
    "timeout",
    "rate_limit",
    "quota",
    "provider_internal",
    "unavailable",
    "circuit_open",
    "unsupported_capability",
    // Contract mismatch is a recoverable provider-attempt failure — try next leaf.
    "structured_output_invalid",
    "contract_validation_failure",
    "network",
    "http_5xx",
    // Provider leaf errors that aren't classified more specifically still warrant trying the next leaf.
    "unknown",
  ]);

/** Categories that must NOT trigger failover by default. */
export const DEFAULT_NO_FAILOVER_CATEGORIES: ReadonlySet<PerformanceFailureCategory> =
  new Set([
    "invalid_request",
    "tenant_violation",
    "invalid_asset",
    "authentication",
    "configuration",
    "infrastructure",
  ]);

export function canonicalKindToFailureCategory(
  kind: CanonicalErrorKind | string
): PerformanceFailureCategory {
  switch (kind) {
    case "authentication":
      return "authentication";
    case "authorization":
      return "tenant_violation";
    case "rate_limit":
      return "rate_limit";
    case "timeout":
      return "timeout";
    case "quota":
      return "quota";
    case "content_policy":
      return "content_policy";
    case "provider_internal":
      return "provider_internal";
    case "unavailable":
      return "unavailable";
    default:
      return "unknown";
  }
}

export function classifyExecutionFailure(input: {
  status?: ProviderExecutionStatus;
  error?: ProviderExecutionError;
  message?: string;
  httpStatus?: number;
}): PerformanceFailureCategory {
  const code = (input.error?.code ?? "").toUpperCase();
  const providerErrorCode = (
    input.error?.providerErrorCode ??
    (input.error as { providerCode?: string } | undefined)?.providerCode ??
    ""
  )
    .toString()
    .toLowerCase();
  const msg = `${input.error?.message ?? ""} ${input.message ?? ""}`.toLowerCase();
  const httpStatus =
    input.httpStatus ??
    input.error?.httpStatus ??
    (typeof (input.error as { status?: number } | undefined)?.status === "number"
      ? (input.error as { status?: number }).status
      : undefined);

  if (
    code.includes("POLL_MAX_DURATION") ||
    code.includes("PROVIDER_POLL_MAX_DURATION") ||
    code === "PROVIDER_POLL_MAX_DURATION" ||
    msg.includes("provider_poll_max_duration") ||
    msg.includes("polling exhausted")
  ) {
    // Local poll budget — not a recoverable provider terminal for failover.
    return "infrastructure";
  }
  if (
    code === "STRUCTURED_OUTPUT_INVALID" ||
    code === "STRUCTURED_OUTPUT_TRUNCATED" ||
    code.includes("STRUCTURED_OUTPUT") ||
    code.includes("CONTRACT_VALIDATION") ||
    msg.includes("structured_output_invalid") ||
    msg.includes("contract validation")
  ) {
    if (code.includes("CONTRACT_VALIDATION") || msg.includes("contract validation")) {
      return "contract_validation_failure";
    }
    return "structured_output_invalid";
  }
  if (code === "CIRCUIT_OPEN" || code === "ALL_PROVIDERS_COOLING_DOWN") {
    return "circuit_open";
  }
  if (input.status === "timed_out" || code.includes("TIMEOUT") || msg.includes("timed out") || httpStatus === 408) {
    return "timeout";
  }
  if (msg.includes("circuit breaker") || msg.includes("circuit_open") || code === "CIRCUIT_OPEN") {
    return "circuit_open";
  }

  // Credit / billing exhaustion — typed quota, even when the vendor returns HTTP 429.
  // Must be classified BEFORE generic rate_limit so exhausted providers are skipped
  // for the rest of the failover chain (not treated as transient 429).
  if (
    providerErrorCode === "credit_balance_exhausted" ||
    providerErrorCode.includes("credit_balance") ||
    providerErrorCode === "insufficient_quota" ||
    providerErrorCode.includes("insufficient_quota") ||
    providerErrorCode.includes("billing_not_active") ||
    msg.includes("credit_balance_exhausted") ||
    msg.includes("credit balance") ||
    msg.includes("exhausted your credit") ||
    msg.includes("too low to access") ||
    msg.includes("plans & billing")
  ) {
    return "quota";
  }

  if (
    httpStatus === 429 ||
    code.includes("RATE") ||
    msg.includes("rate limit") ||
    msg.includes("rate_limit") ||
    /\bhttp\s*429\b/.test(msg) ||
    msg.includes("too many requests")
  ) {
    return "rate_limit";
  }
  // DeepSeek/OpenAI-compat billing: HTTP 402 Payment Required, insufficient balance, etc.
  if (
    httpStatus === 402 ||
    code.includes("QUOTA") ||
    msg.includes("quota") ||
    /\bhttp\s*402\b/.test(msg) ||
    msg.includes("payment required") ||
    msg.includes("insufficient balance") ||
    msg.includes("insufficient_quota") ||
    msg.includes("out of credit") ||
    msg.includes("billing")
  ) {
    return "quota";
  }
  if (
    httpStatus === 401 ||
    httpStatus === 403 ||
    code.includes("AUTH") ||
    msg.includes("authentication") ||
    msg.includes("unauthorized") ||
    msg.includes("forbidden") ||
    msg.includes("api key")
  ) {
    return "authentication";
  }
  if (
    msg.includes("econnrefused") ||
    msg.includes("enotfound") ||
    msg.includes("econnreset") ||
    msg.includes("socket hang up") ||
    msg.includes("network") ||
    msg.includes("fetch failed") ||
    code.includes("NETWORK") ||
    (input.error as { failureCategory?: string } | undefined)?.failureCategory === "network"
  ) {
    return "network";
  }
  // Leaf/model inventory mismatches — recoverable via another provider/model.
  if (
    msg.includes("not declared in the manifest") ||
    msg.includes("not available in") ||
    msg.includes("no longer available") ||
    msg.includes("discontinued") ||
    msg.includes("unsupported") ||
    code.includes("UNSUPPORTED") ||
    (msg.includes("capability") && !msg.includes("invalid"))
  ) {
    return "unsupported_capability";
  }
  if (
    code.includes("VALIDATION") ||
    code.includes("INVALID") ||
    msg.includes("invalid request") ||
    msg.includes("invalid_request")
  ) {
    return "invalid_request";
  }
  if (msg.includes("content policy") || msg.includes("content_policy") || msg.includes("safety")) {
    return "content_policy";
  }
  if (
    msg.includes("mongo") ||
    msg.includes("s3") ||
    msg.includes("infrastructure") ||
    code.includes("INFRA")
  ) {
    return "infrastructure";
  }
  if (httpStatus !== undefined && httpStatus >= 500 && httpStatus < 600) {
    return "http_5xx";
  }
  if (httpStatus !== undefined && httpStatus >= 400 && httpStatus < 500) {
    return "http_4xx";
  }
  if (
    msg.includes("unavailable") ||
    msg.includes("not available") ||
    code.includes("UNAVAILABLE") ||
    code === "PROVIDER_ERROR"
  ) {
    // PROVIDER_ERROR is coarse — treat as unavailable/recoverable unless message says otherwise.
    if (msg.includes("invalid")) return "invalid_request";
    return "unavailable";
  }
  if (code.includes("INTERNAL") || msg.includes("internal") || /\bhttp\s*5\d\d\b/.test(msg)) {
    return "provider_internal";
  }
  return "unknown";
}

export function shouldFailover(
  category: PerformanceFailureCategory,
  options?: {
    allowContentPolicyFailover?: boolean;
    failoverCategories?: ReadonlySet<PerformanceFailureCategory>;
    noFailoverCategories?: ReadonlySet<PerformanceFailureCategory>;
  }
): boolean {
  const no = options?.noFailoverCategories ?? DEFAULT_NO_FAILOVER_CATEGORIES;
  if (no.has(category)) return false;

  if (category === "content_policy") {
    return Boolean(options?.allowContentPolicyFailover);
  }

  const yes = options?.failoverCategories ?? DEFAULT_FAILOVER_CATEGORIES;
  return yes.has(category);
}
