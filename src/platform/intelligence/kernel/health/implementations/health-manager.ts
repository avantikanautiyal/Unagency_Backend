/**
 * Health manager.
 *
 * Purpose: Aggregate internal health checks for the kernel.
 * Responsibilities: registerCheck, runChecks, overallStatus; implements IHealthRegistry.
 * Usage: Constructed by CompositionRoot; no HTTP endpoints.
 * Future Extension: Timeouts, weighted checks, provider health.
 */

import type { HealthStatus } from "../../../shared/enums";
import type { IClock } from "../../../shared/interfaces";
import type { HealthCheckResult, PlatformHealth } from "../contracts/health";
import type { IHealthCheck } from "../interfaces/health";
import type { IHealthManager } from "../interfaces/health-manager";

export class HealthManager implements IHealthManager {
  private readonly checks = new Map<string, IHealthCheck>();

  constructor(private readonly clock: IClock) {}

  register(check: IHealthCheck): void {
    this.registerCheck(check);
  }

  registerCheck(check: IHealthCheck): void {
    this.checks.set(check.name, check);
  }

  get(name: string): IHealthCheck | undefined {
    return this.checks.get(name);
  }

  async checkAll(): Promise<PlatformHealth> {
    return this.runChecks();
  }

  async runChecks(): Promise<PlatformHealth> {
    const results: Record<string, HealthCheckResult> = {};
    let overall: HealthStatus = "healthy";

    for (const [name, check] of this.checks) {
      const result = await check.check();
      results[name] = result;
      overall = mergeHealth(overall, result.status);
    }

    return {
      status: overall,
      checks: results,
      checkedAt: this.clock.nowIso(),
    };
  }

  async overallStatus(): Promise<HealthStatus> {
    const report = await this.runChecks();
    return report.status;
  }

  clear(): void {
    this.checks.clear();
  }
}

function mergeHealth(current: HealthStatus, next: HealthStatus): HealthStatus {
  const rank: Record<HealthStatus, number> = {
    healthy: 0,
    unknown: 1,
    degraded: 2,
    unhealthy: 3,
  };
  return rank[next] > rank[current] ? next : current;
}
