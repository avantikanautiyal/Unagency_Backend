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
  ]);

/** Categories that must NOT trigger failover by default. */
export const DEFAULT_NO_FAILOVER_CATEGORIES: ReadonlySet<PerformanceFailureCategory> =
  new Set([
    "invalid_request",
    "tenant_violation",
    "invalid_asset",
    "unsupported_capability",
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
}): PerformanceFailureCategory {
  const code = (input.error?.code ?? "").toUpperCase();
  const msg = `${input.error?.message ?? ""} ${input.message ?? ""}`.toLowerCase();

  if (input.status === "timed_out" || code.includes("TIMEOUT") || msg.includes("timed out")) {
    return "timeout";
  }
  if (msg.includes("circuit breaker") || msg.includes("circuit_open") || code === "CIRCUIT_OPEN") {
    return "circuit_open";
  }
  if (code.includes("RATE") || msg.includes("rate limit") || msg.includes("rate_limit")) {
    return "rate_limit";
  }
  if (code.includes("QUOTA") || msg.includes("quota")) {
    return "quota";
  }
  if (
    code.includes("AUTH") ||
    msg.includes("authentication") ||
    msg.includes("unauthorized") ||
    msg.includes("api key")
  ) {
    return "authentication";
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
    msg.includes("unsupported") ||
    code.includes("UNSUPPORTED") ||
    msg.includes("capability")
  ) {
    return "unsupported_capability";
  }
  if (
    msg.includes("mongo") ||
    msg.includes("s3") ||
    msg.includes("infrastructure") ||
    code.includes("INFRA")
  ) {
    return "infrastructure";
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
  if (code.includes("INTERNAL") || msg.includes("internal")) {
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
