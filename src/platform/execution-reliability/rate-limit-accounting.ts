/**
 * Declared rate-limit accounting dimensions for the API gateway.
 *
 * USER_REQUEST — user-initiating / mutating API actions (create, transition, cancel…).
 * BACKGROUND_POLL — client hydration of in-flight work (GET execution/status/stream…).
 * INTERNAL_ORCHESTRATION — reserved for framework-internal gateway traffic that must
 *   not consume the user-facing request bucket.
 * PROVIDER_OPERATION — never counted here (provider adapters own their own limits).
 */

import type { RateLimitDimension } from "../api/contracts";
import type { RateLimitAccountingClass } from "./execution-outcome";

export type { RateLimitAccountingClass };

export const DEFAULT_USER_REQUEST_POLICIES: readonly {
  readonly dimension: RateLimitDimension;
  readonly limit: number;
  readonly windowMs: number;
}[] = [
  { dimension: "organization", limit: 1000, windowMs: 60_000 },
  { dimension: "workspace", limit: 500, windowMs: 60_000 },
  { dimension: "user", limit: 120, windowMs: 60_000 },
  { dimension: "api_key", limit: 300, windowMs: 60_000 },
  { dimension: "capability", limit: 200, windowMs: 60_000 },
  { dimension: "provider", limit: 200, windowMs: 60_000 },
];

/** Separate buckets so polling cannot exhaust the user request quota. */
export const DEFAULT_BACKGROUND_POLL_POLICIES: readonly {
  readonly dimension: RateLimitDimension;
  readonly limit: number;
  readonly windowMs: number;
}[] = [
  { dimension: "organization_poll", limit: 3000, windowMs: 60_000 },
  { dimension: "user_poll", limit: 600, windowMs: 60_000 },
];

export function resolveRateLimitCheckDimensions(input: {
  readonly accountingClass?: RateLimitAccountingClass;
  readonly organizationId?: string;
  readonly workspaceId?: string;
  readonly userId?: string;
  readonly apiKeyId?: string;
  readonly capabilityId?: string;
  readonly providerId?: string;
}): readonly { dimension: RateLimitDimension; value?: string }[] {
  const cls = input.accountingClass ?? "USER_REQUEST";

  if (cls === "BACKGROUND_POLL" || cls === "INTERNAL_ORCHESTRATION") {
    return [
      { dimension: "organization_poll", value: input.organizationId },
      { dimension: "user_poll", value: input.userId },
    ];
  }

  // PROVIDER_OPERATION is not gateway-accounted; fall through to user request
  // if somehow invoked so fail-closed behavior still applies.
  return [
    { dimension: "organization", value: input.organizationId },
    { dimension: "workspace", value: input.workspaceId },
    { dimension: "user", value: input.userId },
    { dimension: "api_key", value: input.apiKeyId },
    { dimension: "capability", value: input.capabilityId },
    { dimension: "provider", value: input.providerId },
  ];
}
