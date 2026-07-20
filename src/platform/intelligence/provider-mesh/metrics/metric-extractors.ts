/**
 * Supporting metric extractors (latency / availability / reliability / performance).
 */

import type { ProviderTelemetryWindow } from "../contracts/state";

export function extractLatencyMetrics(t: ProviderTelemetryWindow) {
  return {
    averageLatencyMs: t.averageLatencyMs,
    p95LatencyMs: t.p95LatencyMs,
  };
}

export function extractAvailabilityMetrics(t: ProviderTelemetryWindow) {
  return { availability: t.availability };
}

export function extractReliabilityMetrics(t: ProviderTelemetryWindow) {
  return {
    errorRate: t.errorRate,
    retryRate: t.retryRate,
    timeoutRate: t.timeoutRate,
    successRate: t.successRate,
  };
}

export function extractPerformanceMetrics(t: ProviderTelemetryWindow) {
  return {
    averageLatencyMs: t.averageLatencyMs,
    p95LatencyMs: t.p95LatencyMs,
    averageQuality: t.averageQuality,
  };
}
