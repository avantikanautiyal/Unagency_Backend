/**
 * Redis-backed distributed rate limiting — authoritative async check.
 * Fail-closed when Redis/kv is unavailable (M9.4A).
 */

import { failure, success, type Result } from "../../../intelligence/shared/result";
import { ValidationError } from "../../../intelligence/shared/errors";
import type { RateLimitDecision, RateLimitDimension, RateLimitPolicy } from "../../../api/contracts";
import type { IRateLimitService } from "../../../api/interfaces";
import type { KvClient } from "./shared-memory-kv";

const DEFAULT_POLICIES: readonly RateLimitPolicy[] = [
  { dimension: "organization", limit: 1000, windowMs: 60_000 },
  { dimension: "workspace", limit: 500, windowMs: 60_000 },
  { dimension: "user", limit: 120, windowMs: 60_000 },
  { dimension: "api_key", limit: 300, windowMs: 60_000 },
  { dimension: "capability", limit: 200, windowMs: 60_000 },
  { dimension: "provider", limit: 200, windowMs: 60_000 },
];

export class DistributedRateLimitService implements IRateLimitService {
  private available = true;

  constructor(
    private readonly redis: KvClient | undefined,
    private readonly nowIso: () => string,
    private readonly clockMs: () => number,
    private readonly policies: readonly RateLimitPolicy[] = DEFAULT_POLICIES,
    private readonly keyPrefix = "enterprise:rl:"
  ) {
    this.available = Boolean(redis);
  }

  isAvailable(): boolean {
    return this.available && Boolean(this.redis);
  }

  markUnavailable(): void {
    this.available = false;
  }

  markAvailable(): void {
    this.available = Boolean(this.redis);
  }

  async check(input: {
    organizationId?: string;
    workspaceId?: string;
    userId?: string;
    apiKeyId?: string;
    capabilityId?: string;
    providerId?: string;
  }): Promise<Result<RateLimitDecision>> {
    if (!this.isAvailable() || !this.redis) {
      return failure(
        new ValidationError("rate limit store unavailable — refusing traffic (fail-closed)")
      );
    }

    const checks: { dimension: RateLimitDimension; value?: string }[] = [
      { dimension: "organization", value: input.organizationId },
      { dimension: "workspace", value: input.workspaceId },
      { dimension: "user", value: input.userId },
      { dimension: "api_key", value: input.apiKeyId },
      { dimension: "capability", value: input.capabilityId },
      { dimension: "provider", value: input.providerId },
    ];

    let tightest: RateLimitDecision | undefined;
    const now = this.clockMs();

    try {
      for (const c of checks) {
        if (!c.value) continue;
        const policy = this.policies.find((p) => p.dimension === c.dimension)!;
        const windowId = Math.floor(now / policy.windowMs);
        const key = `${this.keyPrefix}${c.dimension}:${c.value}:${windowId}`;
        const count = await this.redis.incrby(key, 1);
        if (count === 1) {
          await this.redis.set(key, String(count), "EX", Math.ceil(policy.windowMs / 1000));
        }
        const remaining = Math.max(0, policy.limit - count);
        const decision: RateLimitDecision = {
          allowed: count <= policy.limit,
          remaining,
          resetAt: new Date((windowId + 1) * policy.windowMs).toISOString(),
          dimension: c.dimension,
          key: `${c.dimension}:${c.value}`,
        };
        if (!decision.allowed) return success(decision);
        if (!tightest || decision.remaining < tightest.remaining) tightest = decision;
      }
    } catch {
      this.available = false;
      return failure(
        new ValidationError("rate limit store unavailable — refusing traffic (fail-closed)")
      );
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

/** Fail-closed rate limiter when Redis is required but missing. */
export class UnavailableRateLimitService implements IRateLimitService {
  constructor(private readonly nowIso: () => string = () => new Date().toISOString()) {}

  isAvailable(): boolean {
    return false;
  }

  async check(): Promise<Result<RateLimitDecision>> {
    return failure(
      new ValidationError("rate limit store unavailable — refusing traffic (fail-closed)")
    );
  }
}
