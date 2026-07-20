/**
 * Observability projection from mesh snapshot.
 */

import type { ProviderMeshSnapshot } from "../contracts/result";

export interface MeshObservabilitySummary {
  readonly providerCount: number;
  readonly averageLatencyMs: number;
  readonly averageErrorRate: number;
  readonly averageAvailability: number;
  readonly healthyCount: number;
  readonly degradedCount: number;
}

export function summarizeObservability(snapshot: ProviderMeshSnapshot): MeshObservabilitySummary {
  const providers = snapshot.providers;
  const n = Math.max(1, providers.length);
  return {
    providerCount: providers.length,
    averageLatencyMs:
      providers.reduce((s, p) => s + p.telemetry.averageLatencyMs, 0) / n,
    averageErrorRate: providers.reduce((s, p) => s + p.telemetry.errorRate, 0) / n,
    averageAvailability:
      providers.reduce((s, p) => s + p.telemetry.availability, 0) / n,
    healthyCount: providers.filter((p) => p.state === "healthy").length,
    degradedCount: providers.filter(
      (p) => p.state === "degraded" || p.state === "unavailable" || p.state === "rate_limited"
    ).length,
  };
}
