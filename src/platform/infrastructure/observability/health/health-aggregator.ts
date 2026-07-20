/**
 * Health aggregation.
 */

import type { HealthCheckResult } from "../contracts/telemetry";
import type { HealthStatus } from "../contracts/enums";
import type { PlatformHealthSnapshot } from "../interfaces/observability";

export function aggregateHealth(
  checks: readonly HealthCheckResult[],
  nowIso: string
): PlatformHealthSnapshot {
  // latest per component
  const latest = new Map<string, HealthCheckResult>();
  for (const c of checks) {
    const prev = latest.get(c.component);
    if (!prev || Date.parse(c.checkedAt) >= Date.parse(prev.checkedAt)) {
      latest.set(c.component, c);
    }
  }
  const components = [...latest.values()];
  const overall = rollup(components.map((c) => c.status));
  return { overall, components, checkedAt: nowIso };
}

function rollup(statuses: readonly HealthStatus[]): HealthStatus {
  if (!statuses.length) return "unknown";
  if (statuses.some((s) => s === "unhealthy")) return "unhealthy";
  if (statuses.some((s) => s === "degraded")) return "degraded";
  if (statuses.every((s) => s === "healthy")) return "healthy";
  return "unknown";
}
