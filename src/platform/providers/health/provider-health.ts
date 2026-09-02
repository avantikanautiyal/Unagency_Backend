/**
 * Provider health contracts.
 *
 * Purpose: Describe provider operational health without monitoring systems.
 * Responsibilities: Health status enum and health report shapes.
 * Usage: Registry listHealthyProviders; future health probes.
 * Future Extension: Latency SLOs, error-rate thresholds.
 */

import type { ProviderId } from "../../core/identifiers";

export type ProviderHealthStatus =
  | "healthy"
  | "degraded"
  | "offline"
  | "maintenance"
  | "deprecated";

export interface ProviderHealthReport {
  readonly providerId: ProviderId;
  readonly status: ProviderHealthStatus;
  readonly message?: string;
  readonly checkedAt: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface IProviderHealthStore {
  get(providerId: ProviderId): ProviderHealthReport | undefined;
  set(report: ProviderHealthReport): void;
  list(): readonly ProviderHealthReport[];
  clear(): void;
}
