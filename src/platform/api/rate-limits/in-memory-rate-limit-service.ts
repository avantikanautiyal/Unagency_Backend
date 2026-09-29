/**
 * Rate limiting — per org / workspace / user / api key / capability / provider,
 * plus separate poll buckets for BACKGROUND_POLL accounting.
 */

import { success, type Result } from "../../core/result";
import type { RateLimitDecision, RateLimitDimension, RateLimitPolicy } from "../contracts";
import type { IRateLimitService } from "../interfaces";
import {
  DEFAULT_BACKGROUND_POLL_POLICIES,
  DEFAULT_USER_REQUEST_POLICIES,
  resolveRateLimitCheckDimensions,
} from "../../execution-reliability/rate-limit-accounting";
import type { RateLimitAccountingClass } from "../../execution-reliability/execution-outcome";

const DEFAULT_POLICIES: readonly RateLimitPolicy[] = [
  ...DEFAULT_USER_REQUEST_POLICIES,
  ...DEFAULT_BACKGROUND_POLL_POLICIES,
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
    accountingClass?: RateLimitAccountingClass;
  }): Promise<Result<RateLimitDecision>> {
    const accountingClass = input.accountingClass ?? "USER_REQUEST";
    const checks = resolveRateLimitCheckDimensions({
      accountingClass,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      apiKeyId: input.apiKeyId,
      capabilityId: input.capabilityId,
      providerId: input.providerId,
    });

    let tightest: RateLimitDecision | undefined;

    for (const c of checks) {
      if (!c.value) continue;
      const policy = this.policies.find((p) => p.dimension === c.dimension);
      if (!policy) continue;
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
        limit: policy.limit,
        windowMs: policy.windowMs,
        accountingClass,
      };
      if (!decision.allowed) return Promise.resolve(success(decision));
      if (!tightest || decision.remaining < tightest.remaining) tightest = decision;
    }

    return Promise.resolve(
      success(
        tightest ?? {
          allowed: true,
          remaining: 999,
          resetAt: this.nowIso(),
          dimension: "organization" as RateLimitDimension,
          key: "none",
          accountingClass,
        }
      )
    );
  }
}
