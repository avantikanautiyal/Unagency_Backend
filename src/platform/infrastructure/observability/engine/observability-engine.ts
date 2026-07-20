/**
 * Observability Engine — central AIOps ingest + query surface.
 */

import { failure, success, type Result } from "../../../intelligence/shared/result";
import { ValidationError } from "../../../intelligence/shared/errors";
import type {
  IObservabilityEngine,
  ITelemetryStore,
  CostIntelligenceSnapshot,
  TokenIntelligenceSnapshot,
  PlatformHealthSnapshot,
} from "../interfaces/observability";
import type {
  AlertRecord,
  DashboardKind,
  DashboardModel,
  DiagnosticReport,
  ExportPayload,
  LogRecord,
  MetricPoint,
  ObservabilityEvent,
  ObservabilityReport,
  ReportKind,
  RetentionPolicy,
  TraceSpan,
} from "../contracts";
import { InMemoryTelemetryStore } from "../tracing/in-memory-telemetry-store";
import { aggregateCosts } from "../costs/cost-intelligence";
import { aggregateTokens } from "../tokens/token-intelligence";
import { aggregateHealth } from "../health/health-aggregator";
import { evaluateAlerts } from "../alerts/alert-evaluator";
import { buildDashboard } from "../dashboards/dashboard-builder";
import { buildDiagnostic } from "../diagnostics/diagnostic-builder";
import { generateReport } from "../reporting/report-generator";
import { applyRetention } from "../retention/retention";
import { exportTelemetry } from "../exports/export-telemetry";
import { DEFAULT_RETENTION } from "../constants";

export interface ObservabilityEngineDeps {
  readonly store?: ITelemetryStore;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
  readonly budgetLimit?: number;
}

export class ObservabilityEngine implements IObservabilityEngine {
  private readonly store: ITelemetryStore;
  private readonly nowIso: () => string;
  private readonly clockMs: () => number;
  private readonly createId: (prefix: string) => string;
  private readonly budgetLimit?: number;
  private readonly evaluatedAlertIds = new Set<string>();

  constructor(deps: ObservabilityEngineDeps = {}) {
    this.store = deps.store ?? new InMemoryTelemetryStore();
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.clockMs = deps.clockMs ?? (() => Date.now());
    this.createId = deps.createId ?? ((p) => `${p}_${this.clockMs()}`);
    this.budgetLimit = deps.budgetLimit;
  }

  ingest(event: ObservabilityEvent): Result<void> {
    if (!event.eventId?.trim()) {
      return failure(new ValidationError("eventId is required"));
    }
    if (!event.context?.correlationId?.trim()) {
      return failure(new ValidationError("context.correlationId is required"));
    }

    const traceId = event.context.traceId || event.context.correlationId;

    if (event.span) {
      const span: TraceSpan = {
        spanId: this.createId("span"),
        traceId,
        parentSpanId: event.span.parentSpanId,
        name: event.span.name,
        surface: event.span.surface,
        status: event.span.status,
        startedAt: event.span.startedAt,
        completedAt: event.span.completedAt,
        durationMs: event.span.durationMs,
        context: { ...event.context, traceId },
        attributes: event.span.attributes,
        errorMessage: event.span.errorMessage,
      };
      this.store.addSpan(span);
    }

    for (const m of event.metrics ?? []) {
      this.store.addMetric({
        ...m,
        surface: event.surface,
        at: event.at,
        context: event.context,
      });
    }

    if (event.log) {
      this.store.addLog({
        logId: this.createId("log"),
        level: event.log.level,
        message: event.log.message,
        surface: event.surface,
        at: event.at,
        context: event.context,
        attributes: event.log.attributes,
      });
    }

    if (event.tokens) {
      this.store.addTokens({
        recordId: this.createId("tok"),
        at: event.at,
        context: event.context,
        ...event.tokens,
      });
    }

    if (event.cost) {
      this.store.addCost({
        recordId: this.createId("cost"),
        at: event.at,
        context: event.context,
        ...event.cost,
      });
    }

    if (event.health) {
      this.store.addHealth({
        ...event.health,
        checkedAt: event.at,
      });
    }

    return success(undefined);
  }

  ingestMany(events: readonly ObservabilityEvent[]): Result<{ accepted: number }> {
    let accepted = 0;
    for (const e of events) {
      const r = this.ingest(e);
      if (r.ok) accepted += 1;
    }
    return success({ accepted });
  }

  getTrace(traceId: string): Result<readonly TraceSpan[]> {
    return success(this.store.listSpans().filter((s) => s.traceId === traceId));
  }

  getTraceByCorrelation(correlationId: string): Result<readonly TraceSpan[]> {
    return success(
      this.store.listSpans().filter((s) => s.context.correlationId === correlationId)
    );
  }

  queryMetrics(filter?: {
    name?: string;
    surface?: string;
    since?: string;
  }): Result<readonly MetricPoint[]> {
    let list = this.store.listMetrics();
    if (filter?.name) list = list.filter((m) => m.name === filter.name);
    if (filter?.surface) list = list.filter((m) => m.surface === filter.surface);
    if (filter?.since) {
      const since = Date.parse(filter.since);
      list = list.filter((m) => Date.parse(m.at) >= since);
    }
    return success(list);
  }

  queryLogs(filter?: {
    level?: string;
    surface?: string;
    since?: string;
  }): Result<readonly LogRecord[]> {
    let list = this.store.listLogs();
    if (filter?.level) list = list.filter((l) => l.level === filter.level);
    if (filter?.surface) list = list.filter((l) => l.surface === filter.surface);
    if (filter?.since) {
      const since = Date.parse(filter.since);
      list = list.filter((l) => Date.parse(l.at) >= since);
    }
    return success(list);
  }

  costSummary(filter?: {
    organizationId?: string;
    providerId?: string;
    since?: string;
  }): Result<CostIntelligenceSnapshot> {
    return success(aggregateCosts(this.store.listCosts(), filter, this.budgetLimit));
  }

  tokenSummary(filter?: {
    organizationId?: string;
    providerId?: string;
    since?: string;
  }): Result<TokenIntelligenceSnapshot> {
    return success(aggregateTokens(this.store.listTokens(), filter));
  }

  health(): Result<PlatformHealthSnapshot> {
    return success(aggregateHealth(this.store.listHealth(), this.nowIso()));
  }

  evaluateAlerts(): Result<readonly AlertRecord[]> {
    const fresh = evaluateAlerts({
      spans: this.store.listSpans(),
      metrics: this.store.listMetrics(),
      costs: this.store.listCosts(),
      createId: this.createId,
      nowIso: this.nowIso,
      budgetLimit: this.budgetLimit,
    });
    for (const a of fresh) {
      if (!this.evaluatedAlertIds.has(a.alertId)) {
        this.store.addAlert(a);
        this.evaluatedAlertIds.add(a.alertId);
      }
    }
    return success(fresh);
  }

  listAlerts(activeOnly = false): Result<readonly AlertRecord[]> {
    let list = this.store.listAlerts();
    if (activeOnly) list = list.filter((a) => !a.resolvedAt);
    return success(list);
  }

  buildDashboard(kind: DashboardKind): Result<DashboardModel> {
    const health = this.health();
    const costs = this.costSummary();
    const tokens = this.tokenSummary();
    const alerts = this.listAlerts(true);
    if (!health.ok || !costs.ok || !tokens.ok || !alerts.ok) {
      return failure(new ValidationError("unable to build dashboard"));
    }
    return success(
      buildDashboard(kind, {
        health: health.value,
        costs: costs.value,
        tokens: tokens.value,
        alerts: alerts.value,
        spans: this.store.listSpans(),
        metrics: this.store.listMetrics(),
        nowIso: this.nowIso(),
      })
    );
  }

  diagnose(correlationId: string): Result<DiagnosticReport> {
    if (!correlationId?.trim()) {
      return failure(new ValidationError("correlationId is required"));
    }
    return success(
      buildDiagnostic(correlationId, this.store.listSpans(), this.createId, this.nowIso())
    );
  }

  generateReport(
    kind: ReportKind,
    periodStart: string,
    periodEnd: string
  ): Result<ObservabilityReport> {
    const health = this.health();
    const costs = this.costSummary();
    const tokens = this.tokenSummary();
    const alerts = this.listAlerts();
    if (!health.ok || !costs.ok || !tokens.ok || !alerts.ok) {
      return failure(new ValidationError("unable to generate report"));
    }
    return success(
      generateReport(kind, periodStart, periodEnd, {
        health: health.value,
        costs: costs.value,
        tokens: tokens.value,
        alerts: alerts.value,
        spans: this.store.listSpans(),
        createId: this.createId,
        nowIso: this.nowIso(),
      })
    );
  }

  applyRetention(policy?: RetentionPolicy): Result<{ purged: number }> {
    const purged = applyRetention(this.store, policy ?? DEFAULT_RETENTION, this.clockMs);
    return success({ purged });
  }

  exportData(
    kind: "traces" | "metrics" | "costs" | "tokens" | "alerts"
  ): Result<ExportPayload> {
    return success(exportTelemetry(this.store, kind, this.createId, this.nowIso()));
  }
}
