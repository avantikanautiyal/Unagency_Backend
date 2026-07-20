/**
 * Telemetry aggregator — rolls events into a window.
 */

import { success, type Result } from "../../shared/result";
import type { ProviderMeshEvent } from "../contracts/inputs";
import type { ProviderTelemetryWindow } from "../contracts/state";
import type { ITelemetryAggregator } from "../interfaces/mesh";

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function p95(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[Math.max(0, idx)] ?? 0;
}

function avg(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export class DefaultTelemetryAggregator implements ITelemetryAggregator {
  aggregate(
    _providerId: string,
    events: readonly ProviderMeshEvent[]
  ): Result<ProviderTelemetryWindow> {
    const latencies: number[] = [];
    const p95Hints: number[] = [];
    const errorRates: number[] = [];
    const retryRates: number[] = [];
    const timeoutRates: number[] = [];
    const availabilities: number[] = [];
    const concurrencies: number[] = [];
    const capacities: number[] = [];
    const costs: number[] = [];
    const qualities: number[] = [];
    const successes: number[] = [];
    let successesCount = 0;
    let executions = 0;

    for (const e of events) {
      if (e.observability) {
        latencies.push(e.observability.latencyMs);
        errorRates.push(e.observability.errorRate);
        costs.push(e.observability.cost);
        qualities.push(e.observability.qualityScore);
        successes.push(e.observability.successRate);
      }
      if (e.execution) {
        executions += 1;
        latencies.push(e.execution.statistics.totalMs);
        const retries = e.execution.statistics.retries;
        const timeouts = e.execution.statistics.timeouts;
        const attempts = Math.max(1, e.execution.statistics.attempts);
        retryRates.push(retries / attempts);
        timeoutRates.push(timeouts / attempts);
        if (e.execution.success) successesCount += 1;
        else errorRates.push(1);
      }
      if (e.metrics) {
        if (e.metrics.latencyMs !== undefined) latencies.push(e.metrics.latencyMs);
        if (e.metrics.p95LatencyMs !== undefined) p95Hints.push(e.metrics.p95LatencyMs);
        if (e.metrics.errorRate !== undefined) errorRates.push(e.metrics.errorRate);
        if (e.metrics.retryRate !== undefined) retryRates.push(e.metrics.retryRate);
        if (e.metrics.timeoutRate !== undefined) timeoutRates.push(e.metrics.timeoutRate);
        if (e.metrics.availability !== undefined) availabilities.push(e.metrics.availability);
        if (e.metrics.concurrentExecutions !== undefined) {
          concurrencies.push(e.metrics.concurrentExecutions);
        }
        if (e.metrics.capacityUtilization !== undefined) {
          capacities.push(e.metrics.capacityUtilization);
        }
        if (e.metrics.cost !== undefined) costs.push(e.metrics.cost);
        if (e.metrics.qualityScore !== undefined) qualities.push(e.metrics.qualityScore);
        if (e.metrics.successRate !== undefined) successes.push(e.metrics.successRate);
      }
      if (e.health) {
        availabilities.push(e.health.healthy ? 1 : 0);
      }
    }

    const sampleCount = Math.max(1, events.length);
    const errorRate = clamp01(avg(errorRates));
    const successRate =
      successes.length > 0
        ? clamp01(avg(successes))
        : executions > 0
          ? successesCount / executions
          : clamp01(1 - errorRate);

    const availability =
      availabilities.length > 0 ? clamp01(avg(availabilities)) : clamp01(successRate);

    const averageLatencyMs = avg(latencies);
    const computedP95 = p95Hints.length > 0 ? avg(p95Hints) : p95(latencies);

    let healthTrend: ProviderTelemetryWindow["healthTrend"] = "stable";
    if (events.length >= 2) {
      const mid = Math.floor(events.length / 2);
      const firstHalf = events.slice(0, mid);
      const secondHalf = events.slice(mid);
      const firstErr = avg(
        firstHalf.flatMap((e) =>
          e.observability
            ? [e.observability.errorRate]
            : e.metrics?.errorRate !== undefined
              ? [e.metrics.errorRate]
              : e.execution && !e.execution.success
                ? [1]
                : [0]
        )
      );
      const secondErr = avg(
        secondHalf.flatMap((e) =>
          e.observability
            ? [e.observability.errorRate]
            : e.metrics?.errorRate !== undefined
              ? [e.metrics.errorRate]
              : e.execution && !e.execution.success
                ? [1]
                : [0]
        )
      );
      if (secondErr > firstErr + 0.05) healthTrend = "worsening";
      else if (secondErr < firstErr - 0.05) healthTrend = "improving";
    }

    return success({
      sampleCount,
      averageLatencyMs,
      p95LatencyMs: computedP95,
      errorRate,
      retryRate: clamp01(avg(retryRates)),
      timeoutRate: clamp01(avg(timeoutRates)),
      availability,
      concurrentExecutions: avg(concurrencies),
      capacityUtilization: clamp01(avg(capacities.length ? capacities : [0.3])),
      averageCost: avg(costs),
      averageQuality: qualities.length ? clamp01(avg(qualities)) : 0.7,
      successRate: clamp01(successRate),
      healthTrend,
    });
  }
}
