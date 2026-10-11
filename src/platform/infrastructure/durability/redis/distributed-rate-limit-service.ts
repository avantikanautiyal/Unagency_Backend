/**
 * Redis-backed distributed rate limiting — authoritative async check.
 * Fail-closed when Redis/kv is unavailable (M9.4A).
 *
 * USER_REQUEST and BACKGROUND_POLL use separate Redis key namespaces so
 * execution hydration polls cannot exhaust the user-facing request bucket.
 */

import { failure, success, type Result } from "../../../core/result";
import { ValidationError } from "../../../core/errors";
import type { RateLimitDecision, RateLimitDimension, RateLimitPolicy } from "../../../api/contracts";
import type { IRateLimitService } from "../../../api/interfaces";
import type { KvClient } from "./shared-memory-kv";
import { ensureRedisClientReady } from "./redis-client-factory";
import type Redis from "ioredis";
import {
  DEFAULT_BACKGROUND_POLL_POLICIES,
  DEFAULT_USER_REQUEST_POLICIES,
  resolveRateLimitCheckDimensions,
} from "../../../execution-reliability/rate-limit-accounting";
import type { RateLimitAccountingClass } from "../../../execution-reliability/execution-outcome";

const DEFAULT_POLICIES: readonly RateLimitPolicy[] = [
  ...DEFAULT_USER_REQUEST_POLICIES,
  ...DEFAULT_BACKGROUND_POLL_POLICIES,
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
    accountingClass?: RateLimitAccountingClass;
  }): Promise<Result<RateLimitDecision>> {
    if (!this.redis) {
      return failure(
        new ValidationError("rate limit store unavailable — refusing traffic (fail-closed)")
      );
    }

    try {
      await ensureKvClientReady(this.redis);
    } catch {
      return failure(
        new ValidationError("rate limit store unavailable — refusing traffic (fail-closed)")
      );
    }

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
    const now = this.clockMs();

    // All dimensions are counted in one concurrent batch: one network round
    // trip to Redis per request instead of one (or two) per dimension.
    const active = checks.flatMap((c) => {
      if (!c.value) return [];
      const policy = this.policies.find((p) => p.dimension === c.dimension);
      if (!policy) return [];
      const windowId = Math.floor(now / policy.windowMs);
      return [
        {
          dimension: c.dimension,
          value: c.value,
          policy,
          windowId,
          key: `${this.keyPrefix}${c.dimension}:${c.value}:${windowId}`,
        },
      ];
    });

    try {
      const redis = this.redis;
      const counts = await Promise.all(
        active.map((c) => redis.incrby(c.key, 1)),
      );
      // First hit of a window sets the key's expiry.
      await Promise.all(
        active.flatMap((c, i) =>
          counts[i] === 1
            ? [
                redis.set(
                  c.key,
                  String(counts[i]),
                  "EX",
                  Math.ceil(c.policy.windowMs / 1000),
                ),
              ]
            : [],
        ),
      );
      for (let i = 0; i < active.length; i += 1) {
        const c = active[i]!;
        const count = counts[i]!;
        const decision: RateLimitDecision = {
          allowed: count <= c.policy.limit,
          remaining: Math.max(0, c.policy.limit - count),
          resetAt: new Date((c.windowId + 1) * c.policy.windowMs).toISOString(),
          dimension: c.dimension,
          key: `${c.dimension}:${c.value}`,
          limit: c.policy.limit,
          windowMs: c.policy.windowMs,
          accountingClass,
        };
        if (!decision.allowed) return success(decision);
        if (!tightest || decision.remaining < tightest.remaining) tightest = decision;
      }
    } catch {
      return failure(
        new ValidationError("rate limit store unavailable — refusing traffic (fail-closed)")
      );
    }

    return success(
      tightest ?? {
        allowed: true,
        remaining: 999,
        resetAt: this.nowIso(),
        dimension: "organization" as RateLimitDimension,
        key: "none",
        accountingClass,
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

async function ensureKvClientReady(kv: KvClient): Promise<void> {
  const client = kv as KvClient & {
    status?: string;
    connect?: () => Promise<unknown>;
  };
  if (typeof client.status !== "string" || typeof client.connect !== "function") {
    return;
  }
  await ensureRedisClientReady(client as Redis);
}
