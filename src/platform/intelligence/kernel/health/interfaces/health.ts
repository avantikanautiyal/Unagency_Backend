/**
 * Kernel health ports.
 * Architecture contracts for platform, provider, and capability health.
 */

import type {
  CapabilityHealth,
  HealthCheckResult,
  PlatformHealth,
  ProviderHealth,
} from "../contracts/health";

/**
 * A single health check unit.
 */
export interface IHealthCheck {
  readonly name: string;
  check(): Promise<HealthCheckResult> | HealthCheckResult;
}

/**
 * Snapshot of health status for a named component.
 */
export interface IHealthStatus {
  readonly name: string;
  readonly result: HealthCheckResult;
}

/**
 * Registry of health checks.
 */
export interface IHealthRegistry {
  register(check: IHealthCheck): void;
  checkAll(): Promise<PlatformHealth>;
  get(name: string): IHealthCheck | undefined;
}

/**
 * Continuous health monitoring (future).
 * No implementation in foundation phase.
 */
export interface IHealthMonitor {
  start(): Promise<void>;
  stop(): Promise<void>;
  getPlatformHealth(): Promise<PlatformHealth>;
  getProviderHealth(providerId: string): Promise<ProviderHealth>;
  getCapabilityHealth(capabilityId: string): Promise<CapabilityHealth>;
}

/** @deprecated Prefer IHealthCheck. M0 registration alias. */
export type HealthRegistration = IHealthCheck;
