/**
 * Kernel health contracts.
 * Architecture only — implementations live in lifecycle (M0) or future adapters.
 */

import type { HealthStatus } from "../../../shared/enums";

/** Result of a single health check. */
export interface HealthCheckResult {
  readonly status: HealthStatus;
  readonly message?: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly checkedAt?: string;
}

/** Aggregate platform health. */
export interface PlatformHealth {
  readonly status: HealthStatus;
  readonly checks: Readonly<Record<string, HealthCheckResult>>;
  readonly checkedAt: string;
}

/** Provider health (future — no provider execution in foundation). */
export interface ProviderHealth {
  readonly providerId: string;
  readonly status: HealthStatus;
  readonly latencyMs?: number;
  readonly message?: string;
  readonly checkedAt: string;
}

/** Capability health (future — no capability execution in foundation). */
export interface CapabilityHealth {
  readonly capabilityId: string;
  readonly status: HealthStatus;
  readonly message?: string;
  readonly checkedAt: string;
}

/** @deprecated Prefer PlatformHealth. Kept for M0 kernel compatibility. */
export type PlatformHealthReport = PlatformHealth;
