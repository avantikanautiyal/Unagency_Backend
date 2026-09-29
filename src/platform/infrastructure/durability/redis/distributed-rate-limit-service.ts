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

    try {
      for (const c of checks) {
        if (!c.value) continue;
        const policy = this.policies.find((p) => p.dimension === c.dimension);
        if (!policy) continue;
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
          limit: policy.limit,
          windowMs: policy.windowMs,
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
