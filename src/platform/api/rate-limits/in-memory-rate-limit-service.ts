/**
 * Rate limiting — per org / workspace / user / api key / capability / provider.
 */

import { success, type Result } from "../../intelligence/shared/result";
import type { RateLimitDecision, RateLimitDimension, RateLimitPolicy } from "../contracts";
import type { IRateLimitService } from "../interfaces";

const DEFAULT_POLICIES: readonly RateLimitPolicy[] = [
  { dimension: "organization", limit: 1000, windowMs: 60_000 },
  { dimension: "workspace", limit: 500, windowMs: 60_000 },
  { dimension: "user", limit: 120, windowMs: 60_000 },
  { dimension: "api_key", limit: 300, windowMs: 60_000 },
  { dimension: "capability", limit: 200, windowMs: 60_000 },
  { dimension: "provider", limit: 200, windowMs: 60_000 },
];

export class InMemoryRateLimitService implements IRateLimitService {
  private readonly counters = new Map<string, { count: number; windowStart: number }>();

  constructor(
    private readonly nowIso: () => string,
    private readonly clockMs: () => number,
    private readonly policies: readonly RateLimitPolicy[] = DEFAULT_POLICIES
  ) {}

  check(input: {
    organizationId?: string;
    workspaceId?: string;
    userId?: string;
    apiKeyId?: string;
    capabilityId?: string;
    providerId?: string;
  }): Result<RateLimitDecision> {
    const checks: { dimension: RateLimitDimension; value?: string }[] = [
      { dimension: "organization", value: input.organizationId },
      { dimension: "workspace", value: input.workspaceId },
      { dimension: "user", value: input.userId },
      { dimension: "api_key", value: input.apiKeyId },
      { dimension: "capability", value: input.capabilityId },
      { dimension: "provider", value: input.providerId },
    ];

    let tightest: RateLimitDecision | undefined;

    for (const c of checks) {
      if (!c.value) continue;
      const policy = this.policies.find((p) => p.dimension === c.dimension)!;
      const key = `${c.dimension}:${c.value}`;
      const now = this.clockMs();
      let bucket = this.counters.get(key);
      if (!bucket || now - bucket.windowStart >= policy.windowMs) {
        bucket = { count: 0, windowStart: now };
      }
      bucket.count += 1;
      this.counters.set(key, bucket);
      const remaining = Math.max(0, policy.limit - bucket.count);
      const decision: RateLimitDecision = {
        allowed: bucket.count <= policy.limit,
        remaining,
        resetAt: new Date(bucket.windowStart + policy.windowMs).toISOString(),
        dimension: c.dimension,
        key,
      };
      if (!decision.allowed) return success(decision);
      if (!tightest || decision.remaining < tightest.remaining) tightest = decision;
    }

    return success(
      tightest ?? {
        allowed: true,
        remaining: 999,
        resetAt: this.nowIso(),
        dimension: "organization",
        key: "none",
      }
    );
  }
}
