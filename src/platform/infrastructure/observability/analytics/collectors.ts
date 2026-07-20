/**
 * Additive collectors — map public Integration / Execution snapshots → events.
 * Does not modify those platforms.
 */

import type { ObservabilityEvent, ObservedSurface, TelemetryContext } from "../contracts";
import type { IntelligenceOsIntegrationReport } from "../../../intelligence/integration/contracts/result";
import type { ExecutionMetricsSnapshot } from "../../execution/contracts/job";

export function collectFromIntegrationReport(
  report: IntelligenceOsIntegrationReport,
  createEventId: (prefix: string) => string
): ObservabilityEvent[] {
  const correlationId = report.trace.correlationId || report.requestId;
  const context: TelemetryContext = {
    correlationId,
    traceId: report.trace.traceId || correlationId,
    executionId: report.requestId,
    organizationId: report.request.organizationId
      ? String(report.request.organizationId)
      : undefined,
    workspaceId: report.request.workspaceId
      ? String(report.request.workspaceId)
      : undefined,
  };

  const events: ObservabilityEvent[] = [];

  for (const stage of report.trace.stages) {
    const surface = mapStageSurface(stage.stage);
    events.push({
      eventId: createEventId("evt"),
      surface,
      at: stage.completedAt,
      context,
      span: {
        name: stage.stage,
        surface,
        status: stage.status === "failed" ? "error" : "ok",
        startedAt: stage.startedAt,
        completedAt: stage.completedAt,
        durationMs: stage.durationMs,
        errorMessage: stage.status === "failed" ? stage.message : undefined,
      },
      metrics: [
        { name: "stage.duration_ms", value: stage.durationMs, unit: "ms", labels: { stage: stage.stage } },
      ],
    });
  }

  const runtime = report.artifacts.runtime;
  if (runtime) {
    events.push({
      eventId: createEventId("evt"),
      surface: "runtime",
      at: runtime.completedAt,
      context: {
        ...context,
        providerId: runtime.response?.providerId
          ? String(runtime.response.providerId)
          : undefined,
      },
      span: {
        name: "provider_runtime",
        surface: "runtime",
        status: runtime.success ? "ok" : "error",
        startedAt: report.createdAt,
        completedAt: runtime.completedAt,
        durationMs: runtime.statistics.totalMs,
        errorMessage: runtime.error?.message,
      },
      tokens: {
        promptTokens: Number((runtime.response?.usage as Record<string, unknown> | undefined)?.prompt_tokens ?? 0),
        completionTokens: Number((runtime.response?.usage as Record<string, unknown> | undefined)?.completion_tokens ?? 0),
        cachedTokens: 0,
        streamingTokens: runtime.statistics.streamingChunks ?? 0,
        toolTokens: 0,
        visionTokens: 0,
        audioTokens: 0,
        totalTokens:
          Number((runtime.response?.usage as Record<string, unknown> | undefined)?.total_tokens ?? 0) ||
          Number((runtime.response?.usage as Record<string, unknown> | undefined)?.prompt_tokens ?? 0) +
            Number((runtime.response?.usage as Record<string, unknown> | undefined)?.completion_tokens ?? 0),
      },
      cost: {
        amount: Number((runtime.response?.usage as Record<string, unknown> | undefined)?.cost ?? 0.01),
        currency: "USD",
        providerId: runtime.response?.providerId
          ? String(runtime.response.providerId)
          : undefined,
      },
      health: {
        component: "provider_runtime",
        surface: "runtime",
        status: runtime.success ? "healthy" : "unhealthy",
        message: runtime.error?.message,
      },
    });
  }

  events.push({
    eventId: createEventId("evt"),
    surface: "integration",
    at: report.createdAt,
    context,
    metrics: [
      { name: "execution.duration_ms", value: report.durationMs, unit: "ms" },
      { name: "execution.success", value: report.success ? 1 : 0, unit: "bool" },
    ],
    log: {
      level: report.success ? "info" : "error",
      message: `Integration pipeline ${report.success ? "succeeded" : "failed"}`,
    },
  });

  return events;
}

export function collectFromExecutionMetrics(
  metrics: ExecutionMetricsSnapshot,
  createEventId: (prefix: string) => string,
  context: Partial<TelemetryContext> = {}
): ObservabilityEvent {
  const correlationId = context.correlationId ?? "exec_metrics";
  const full: TelemetryContext = {
    correlationId,
    traceId: context.traceId ?? correlationId,
    ...context,
  };

  const metricPoints = [
    { name: "worker.utilization", value: metrics.workerUtilization, unit: "ratio" },
    { name: "execution.retries", value: metrics.retryCount, unit: "count" },
    { name: "execution.failure_rate", value: metrics.failureRate, unit: "ratio" },
    { name: "execution.avg_ms", value: metrics.averageExecutionMs, unit: "ms" },
    { name: "queue.avg_ms", value: metrics.averageQueueMs, unit: "ms" },
    {
      name: "queue.depth",
      value: Object.values(metrics.queueLengths).reduce((n, v) => n + v, 0),
      unit: "count",
    },
    { name: "execution.dead_letters", value: metrics.deadLetterCount, unit: "count" },
    { name: "execution.throughput_per_min", value: metrics.throughputPerMinute, unit: "rate" },
  ];

  return {
    eventId: createEventId("evt"),
    surface: "distributed_execution",
    at: metrics.capturedAt,
    context: full,
    metrics: metricPoints,
    health: {
      component: "distributed_execution",
      surface: "distributed_execution",
      status:
        metrics.failureRate > 0.5
          ? "unhealthy"
          : metrics.workerUtilization > 0.9
            ? "degraded"
            : "healthy",
    },
  };
}

function mapStageSurface(stage: string): ObservedSurface {
  const map: Record<string, ObservedSurface> = {
    capability_intelligence: "capability_intelligence",
    model_intelligence: "model_intelligence",
    negotiation: "negotiation",
    routing: "routing",
    provider_runtime: "runtime",
    consensus: "consensus",
    evaluation: "evaluation",
    learning: "learning",
    experience_intelligence: "experience",
    experience_injection: "experience",
    execution_optimization: "execution_optimization",
  };
  return map[stage] ?? "integration";
}
