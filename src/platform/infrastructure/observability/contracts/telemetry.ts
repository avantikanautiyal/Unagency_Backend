/**
 * Core telemetry contracts.
 */

import type {
  AlertKind,
  AlertSeverity,
  DashboardKind,
  HealthStatus,
  ObservedSurface,
  ReportKind,
  RetentionClass,
  SpanStatus,
} from "./enums";

export type TraceId = string & { readonly __brand: "TraceId" };
export type SpanId = string & { readonly __brand: "SpanId" };
export type CorrelationId = string & { readonly __brand: "CorrelationId" };

export function asTraceId(id: string): TraceId {
  return id as TraceId;
}
export function asSpanId(id: string): SpanId {
  return id as SpanId;
}
export function asCorrelationId(id: string): CorrelationId {
  return id as CorrelationId;
}

export interface TelemetryContext {
  readonly correlationId: string;
  readonly traceId: string;
  readonly executionId?: string;
  readonly organizationId?: string;
  readonly workspaceId?: string;
  readonly capabilityId?: string;
  readonly workflowId?: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly department?: string;
}

export interface TraceSpan {
  readonly spanId: string;
  readonly traceId: string;
  readonly parentSpanId?: string;
  readonly name: string;
  readonly surface: ObservedSurface;
  readonly status: SpanStatus;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly context: TelemetryContext;
  readonly attributes?: Readonly<Record<string, unknown>>;
  readonly errorMessage?: string;
}

export interface MetricPoint {
  readonly name: string;
  readonly value: number;
  readonly unit: string;
  readonly surface: ObservedSurface;
  readonly at: string;
  readonly labels?: Readonly<Record<string, string>>;
  readonly context?: Partial<TelemetryContext>;
}

export interface LogRecord {
  readonly logId: string;
  readonly level: "debug" | "info" | "warn" | "error";
  readonly message: string;
  readonly surface: ObservedSurface;
  readonly at: string;
  readonly context?: Partial<TelemetryContext>;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface TokenUsageRecord {
  readonly recordId: string;
  readonly at: string;
  readonly context: TelemetryContext;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly cachedTokens: number;
  readonly streamingTokens: number;
  readonly toolTokens: number;
  readonly visionTokens: number;
  readonly audioTokens: number;
  readonly totalTokens: number;
}

export interface CostRecord {
  readonly recordId: string;
  readonly at: string;
  readonly context: TelemetryContext;
  /** Null when unknown — never invent 0 (M9.5Q). */
  readonly amount: number | null;
  readonly currency: string | null;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly capabilityId?: string;
  readonly department?: string;
}

export interface HealthCheckResult {
  readonly component: string;
  readonly surface: ObservedSurface;
  readonly status: HealthStatus;
  readonly message?: string;
  readonly checkedAt: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface AlertRecord {
  readonly alertId: string;
  readonly kind: AlertKind;
  readonly severity: AlertSeverity;
  readonly title: string;
  readonly message: string;
  readonly surface: ObservedSurface;
  readonly firedAt: string;
  readonly resolvedAt?: string;
  readonly context?: Partial<TelemetryContext>;
  readonly value?: number;
  readonly threshold?: number;
}

export interface DashboardModel {
  readonly kind: DashboardKind;
  readonly title: string;
  readonly generatedAt: string;
  readonly widgets: readonly DashboardWidget[];
}

export interface DashboardWidget {
  readonly id: string;
  readonly title: string;
  readonly type: "stat" | "series" | "table" | "status";
  readonly data: Readonly<Record<string, unknown>>;
}

export interface DiagnosticReport {
  readonly diagnosticId: string;
  readonly correlationId: string;
  readonly rootCause?: string;
  readonly failureTimeline: readonly TraceSpan[];
  readonly dependencyTimeline: readonly string[];
  readonly providerTimeline: readonly string[];
  readonly workerTimeline: readonly string[];
  readonly capabilityTimeline: readonly string[];
  readonly generatedAt: string;
}

export interface ObservabilityReport {
  readonly reportId: string;
  readonly kind: ReportKind;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly generatedAt: string;
  readonly summary: Readonly<Record<string, unknown>>;
  readonly sections: readonly { title: string; data: Readonly<Record<string, unknown>> }[];
}

export interface RetentionPolicy {
  readonly class: RetentionClass;
  readonly maxAgeMs: number;
  readonly maxRecords?: number;
}

export interface ExportPayload {
  readonly exportId: string;
  readonly format: "json";
  readonly generatedAt: string;
  readonly itemCount: number;
  readonly payload: unknown;
}

/** Unified ingest envelope for platform events. */
export interface ObservabilityEvent {
  readonly eventId: string;
  readonly surface: ObservedSurface;
  readonly at: string;
  readonly context: TelemetryContext;
  readonly span?: Omit<TraceSpan, "spanId" | "traceId" | "context"> & {
    readonly name: string;
    readonly surface: ObservedSurface;
    readonly status: SpanStatus;
    readonly startedAt: string;
    readonly completedAt: string;
    readonly durationMs: number;
    readonly parentSpanId?: string;
    readonly attributes?: Readonly<Record<string, unknown>>;
    readonly errorMessage?: string;
  };
  readonly metrics?: readonly Omit<MetricPoint, "at" | "surface">[];
  readonly log?: Omit<LogRecord, "logId" | "at" | "surface">;
  readonly tokens?: Omit<TokenUsageRecord, "recordId" | "at" | "context">;
  readonly cost?: Omit<CostRecord, "recordId" | "at" | "context">;
  readonly health?: Omit<HealthCheckResult, "checkedAt">;
}
