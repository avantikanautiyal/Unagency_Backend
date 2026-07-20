/**
 * Alert evaluation engine.
 */

import type { AlertRecord, MetricPoint, TraceSpan, CostRecord } from "../contracts/telemetry";
import type { ObservedSurface } from "../contracts/enums";
import { DEFAULT_ALERT_THRESHOLDS } from "../constants";

export interface AlertThresholds {
  readonly latencyMs: number;
  readonly failureRate: number;
  readonly costPerRequest: number;
  readonly queueDepth: number;
  readonly workerUtilization: number;
  readonly retryStormCount: number;
  readonly budgetUsagePercent: number;
}

export function evaluateAlerts(input: {
  spans: readonly TraceSpan[];
  metrics: readonly MetricPoint[];
  costs: readonly CostRecord[];
  createId: (prefix: string) => string;
  nowIso: () => string;
  thresholds?: Partial<AlertThresholds>;
  budgetLimit?: number;
}): AlertRecord[] {
  const t = { ...DEFAULT_ALERT_THRESHOLDS, ...input.thresholds };
  const alerts: AlertRecord[] = [];
  const now = input.nowIso();

  const errorSpans = input.spans.filter((s) => s.status === "error");
  if (input.spans.length > 0) {
    const rate = errorSpans.length / input.spans.length;
    if (rate >= t.failureRate) {
      alerts.push({
        alertId: input.createId("alert"),
        kind: "failure",
        severity: "critical",
        title: "High failure rate",
        message: `Failure rate ${(rate * 100).toFixed(1)}% exceeds threshold`,
        surface: "distributed_execution",
        firedAt: now,
        value: rate,
        threshold: t.failureRate,
      });
    }
  }

  for (const span of input.spans) {
    if (span.durationMs >= t.latencyMs) {
      alerts.push({
        alertId: input.createId("alert"),
        kind: "latency",
        severity: "warning",
        title: "High latency",
        message: `Span ${span.name} took ${span.durationMs}ms`,
        surface: span.surface,
        firedAt: now,
        context: span.context,
        value: span.durationMs,
        threshold: t.latencyMs,
      });
    }
  }

  const queueDepth = latestMetric(input.metrics, "queue.depth");
  if (queueDepth != null && queueDepth >= t.queueDepth) {
    alerts.push({
      alertId: input.createId("alert"),
      kind: "queue_saturation",
      severity: "warning",
      title: "Queue saturation",
      message: `Queue depth ${queueDepth}`,
      surface: "queue",
      firedAt: now,
      value: queueDepth,
      threshold: t.queueDepth,
    });
  }

  const util = latestMetric(input.metrics, "worker.utilization");
  if (util != null && util >= t.workerUtilization) {
    alerts.push({
      alertId: input.createId("alert"),
      kind: "worker_saturation",
      severity: "warning",
      title: "Worker saturation",
      message: `Worker utilization ${util}`,
      surface: "worker",
      firedAt: now,
      value: util,
      threshold: t.workerUtilization,
    });
  }

  const retries = sumMetric(input.metrics, "execution.retries");
  if (retries >= t.retryStormCount) {
    alerts.push({
      alertId: input.createId("alert"),
      kind: "retry_storm",
      severity: "critical",
      title: "Retry storm",
      message: `Retry count ${retries}`,
      surface: "distributed_execution",
      firedAt: now,
      value: retries,
      threshold: t.retryStormCount,
    });
  }

  const providerDown = input.metrics.find(
    (m) => m.name === "provider.health" && m.value === 0
  );
  if (providerDown) {
    alerts.push({
      alertId: input.createId("alert"),
      kind: "provider_down",
      severity: "critical",
      title: "Provider down",
      message: `Provider health is 0`,
      surface: (providerDown.surface ?? "provider") as ObservedSurface,
      firedAt: now,
      value: 0,
      threshold: 1,
    });
  }

  if (input.costs.length) {
    const last = input.costs[input.costs.length - 1]!;
    if (last.amount >= t.costPerRequest) {
      alerts.push({
        alertId: input.createId("alert"),
        kind: "cost",
        severity: "warning",
        title: "High cost per request",
        message: `Cost ${last.amount} exceeds ${t.costPerRequest}`,
        surface: "provider",
        firedAt: now,
        context: last.context,
        value: last.amount,
        threshold: t.costPerRequest,
      });
    }
  }

  if (input.budgetLimit && input.budgetLimit > 0) {
    const total = input.costs.reduce((n, c) => n + c.amount, 0);
    const pct = (total / input.budgetLimit) * 100;
    if (pct >= t.budgetUsagePercent) {
      alerts.push({
        alertId: input.createId("alert"),
        kind: "budget_threshold",
        severity: "critical",
        title: "Budget threshold",
        message: `Budget usage ${pct.toFixed(1)}%`,
        surface: "api",
        firedAt: now,
        value: pct,
        threshold: t.budgetUsagePercent,
      });
    }
  }

  const secretExp = latestMetric(input.metrics, "secret.near_expiration");
  if (secretExp != null && secretExp > 0) {
    alerts.push({
      alertId: input.createId("alert"),
      kind: "secret_expiration",
      severity: "warning",
      title: "Secrets near expiration",
      message: `${secretExp} secrets near expiration`,
      surface: "secret_platform",
      firedAt: now,
      value: secretExp,
      threshold: 0,
    });
  }

  return alerts;
}

function latestMetric(metrics: readonly MetricPoint[], name: string): number | undefined {
  for (let i = metrics.length - 1; i >= 0; i -= 1) {
    if (metrics[i]!.name === name) return metrics[i]!.value;
  }
  return undefined;
}

function sumMetric(metrics: readonly MetricPoint[], name: string): number {
  return metrics.filter((m) => m.name === name).reduce((n, m) => n + m.value, 0);
}
