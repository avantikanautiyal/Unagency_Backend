/**
 * Template metrics collector.
 */

import { success, type Result } from "../../../shared/result";
import type { TemplateMetricsSnapshot, TemplateProviderMetrics } from "../contracts/metrics";
import type { IProviderMetricsCollector } from "../interfaces/provider-template";

export class DefaultMetricsCollector implements IProviderMetricsCollector {
  private readonly records: TemplateProviderMetrics[] = [];

  record(metrics: TemplateProviderMetrics): Result<void> {
    this.records.push(metrics);
    return success(undefined);
  }

  snapshot(): Result<TemplateMetricsSnapshot> {
    const total = this.records.length || 1;
    const successes = this.records.filter((r) => r.success).length;
    const avgLatency =
      this.records.reduce((s, r) => s + r.latencyMs, 0) / (this.records.length || 1);

    return success({
      providerId: "template",
      successRate: successes / total,
      failureRate: 1 - successes / total,
      averageLatencyMs: avgLatency,
      totalRequests: this.records.length,
      computedAt: new Date().toISOString(),
    });
  }

  reset(): Result<void> {
    this.records.length = 0;
    return success(undefined);
  }
}
