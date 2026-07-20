/**
 * Observability platform interfaces.
 */

import type { Result } from "../../../intelligence/shared/result";
import type {
  AlertRecord,
  CostRecord,
  DashboardKind,
  DashboardModel,
  DiagnosticReport,
  ExportPayload,
  HealthCheckResult,
  ObservabilityEvent,
  ObservabilityReport,
  ReportKind,
  RetentionPolicy,
  TokenUsageRecord,
  TraceSpan,
  MetricPoint,
  LogRecord,
} from "../contracts";

export interface IObservabilityEngine {
  ingest(event: ObservabilityEvent): Result<void>;
  ingestMany(events: readonly ObservabilityEvent[]): Result<{ accepted: number }>;

  getTrace(traceId: string): Result<readonly TraceSpan[]>;
  getTraceByCorrelation(correlationId: string): Result<readonly TraceSpan[]>;

  queryMetrics(filter?: {
    name?: string;
    surface?: string;
    since?: string;
  }): Result<readonly MetricPoint[]>;

  queryLogs(filter?: {
    level?: string;
    surface?: string;
    since?: string;
  }): Result<readonly LogRecord[]>;

  costSummary(filter?: {
    organizationId?: string;
    providerId?: string;
    since?: string;
  }): Result<CostIntelligenceSnapshot>;

  tokenSummary(filter?: {
    organizationId?: string;
    providerId?: string;
    since?: string;
  }): Result<TokenIntelligenceSnapshot>;

  health(): Result<PlatformHealthSnapshot>;
  evaluateAlerts(): Result<readonly AlertRecord[]>;
  listAlerts(activeOnly?: boolean): Result<readonly AlertRecord[]>;

  buildDashboard(kind: DashboardKind): Result<DashboardModel>;
  diagnose(correlationId: string): Result<DiagnosticReport>;
  generateReport(kind: ReportKind, periodStart: string, periodEnd: string): Result<ObservabilityReport>;

  applyRetention(policy?: RetentionPolicy): Result<{ purged: number }>;
  exportData(kind: "traces" | "metrics" | "costs" | "tokens" | "alerts"): Result<ExportPayload>;
}

export interface CostIntelligenceSnapshot {
  readonly total: number;
  readonly currency: string;
  readonly byOrganization: Readonly<Record<string, number>>;
  readonly byDepartment: Readonly<Record<string, number>>;
  readonly byCapability: Readonly<Record<string, number>>;
  readonly byProvider: Readonly<Record<string, number>>;
  readonly byModel: Readonly<Record<string, number>>;
  readonly projectedMonthly: number;
  readonly budgetUsagePercent?: number;
  readonly records: number;
}

export interface TokenIntelligenceSnapshot {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly cachedTokens: number;
  readonly streamingTokens: number;
  readonly toolTokens: number;
  readonly visionTokens: number;
  readonly audioTokens: number;
  readonly totalTokens: number;
  readonly records: number;
}

export interface PlatformHealthSnapshot {
  readonly overall: import("../contracts/enums").HealthStatus;
  readonly components: readonly HealthCheckResult[];
  readonly checkedAt: string;
}

export interface ITelemetryStore {
  addSpan(span: TraceSpan): void;
  addMetric(metric: MetricPoint): void;
  addLog(log: LogRecord): void;
  addCost(cost: CostRecord): void;
  addTokens(tokens: TokenUsageRecord): void;
  addHealth(health: HealthCheckResult): void;
  addAlert(alert: AlertRecord): void;
  listSpans(): readonly TraceSpan[];
  listMetrics(): readonly MetricPoint[];
  listLogs(): readonly LogRecord[];
  listCosts(): readonly CostRecord[];
  listTokens(): readonly TokenUsageRecord[];
  listHealth(): readonly HealthCheckResult[];
  listAlerts(): readonly AlertRecord[];
  purgeOlderThan(cutoffIso: string): number;
}
