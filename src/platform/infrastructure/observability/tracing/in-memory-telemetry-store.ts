/**
 * In-memory telemetry store.
 */

import type { ITelemetryStore } from "../interfaces/observability";
import type {
  AlertRecord,
  CostRecord,
  HealthCheckResult,
  LogRecord,
  MetricPoint,
  TokenUsageRecord,
  TraceSpan,
} from "../contracts/telemetry";

export class InMemoryTelemetryStore implements ITelemetryStore {
  private spans: TraceSpan[] = [];
  private metrics: MetricPoint[] = [];
  private logs: LogRecord[] = [];
  private costs: CostRecord[] = [];
  private tokens: TokenUsageRecord[] = [];
  private health: HealthCheckResult[] = [];
  private alerts: AlertRecord[] = [];

  addSpan(span: TraceSpan): void {
    this.spans.push(span);
  }
  addMetric(metric: MetricPoint): void {
    this.metrics.push(metric);
  }
  addLog(log: LogRecord): void {
    this.logs.push(log);
  }
  addCost(cost: CostRecord): void {
    this.costs.push(cost);
  }
  addTokens(tokens: TokenUsageRecord): void {
    this.tokens.push(tokens);
  }
  addHealth(health: HealthCheckResult): void {
    this.health.push(health);
  }
  addAlert(alert: AlertRecord): void {
    this.alerts.push(alert);
  }

  listSpans(): readonly TraceSpan[] {
    return this.spans;
  }
  listMetrics(): readonly MetricPoint[] {
    return this.metrics;
  }
  listLogs(): readonly LogRecord[] {
    return this.logs;
  }
  listCosts(): readonly CostRecord[] {
    return this.costs;
  }
  listTokens(): readonly TokenUsageRecord[] {
    return this.tokens;
  }
  listHealth(): readonly HealthCheckResult[] {
    return this.health;
  }
  listAlerts(): readonly AlertRecord[] {
    return this.alerts;
  }

  purgeOlderThan(cutoffIso: string): number {
    const cutoff = Date.parse(cutoffIso);
    const before =
      this.spans.length +
      this.metrics.length +
      this.logs.length +
      this.costs.length +
      this.tokens.length +
      this.health.length;
    this.spans = this.spans.filter((s) => Date.parse(s.completedAt) >= cutoff);
    this.metrics = this.metrics.filter((m) => Date.parse(m.at) >= cutoff);
    this.logs = this.logs.filter((l) => Date.parse(l.at) >= cutoff);
    this.costs = this.costs.filter((c) => Date.parse(c.at) >= cutoff);
    this.tokens = this.tokens.filter((t) => Date.parse(t.at) >= cutoff);
    this.health = this.health.filter((h) => Date.parse(h.checkedAt) >= cutoff);
    const after =
      this.spans.length +
      this.metrics.length +
      this.logs.length +
      this.costs.length +
      this.tokens.length +
      this.health.length;
    return before - after;
  }
}
