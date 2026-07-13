/**
 * Health manager ports.
 *
 * Purpose: Internal health check coordination for the kernel.
 * Responsibilities: Register checks, run checks, compute overall status.
 * Usage: Owned by PlatformKernel; no HTTP exposure.
 * Future Extension: Provider/capability health probes, periodic monitoring.
 */

import type { HealthStatus } from "../../../shared/enums";
import type { HealthCheckResult, PlatformHealth } from "../contracts/health";
import type { IHealthCheck, IHealthRegistry } from "./health";

/**
 * Health manager.
 *
 * Purpose: Aggregate internal health checks without external monitoring systems.
 * Responsibilities: registerCheck, runChecks, overallStatus; implements IHealthRegistry.
 * Usage: Composition Root constructs HealthManager; kernel registers checks at bootstrap.
 * Future Extension: Weighted checks, async timeouts.
 */
export interface IHealthManager extends IHealthRegistry {
  registerCheck(check: IHealthCheck): void;
  runChecks(): Promise<PlatformHealth>;
  overallStatus(): Promise<HealthStatus>;
  clear(): void;
}

export type { IHealthCheck, HealthCheckResult, PlatformHealth };
