/**
 * Dashboard model builders.
 */

import type { DashboardKind, DashboardModel } from "../contracts";
import type { CostIntelligenceSnapshot, TokenIntelligenceSnapshot, PlatformHealthSnapshot } from "../interfaces/observability";
import type { AlertRecord, MetricPoint, TraceSpan } from "../contracts/telemetry";

export function buildDashboard(
  kind: DashboardKind,
  input: {
    health: PlatformHealthSnapshot;
    costs: CostIntelligenceSnapshot;
    tokens: TokenIntelligenceSnapshot;
    alerts: readonly AlertRecord[];
    spans: readonly TraceSpan[];
    metrics: readonly MetricPoint[];
    nowIso: string;
  }
): DashboardModel {
  const base = {
    kind,
    generatedAt: input.nowIso,
  };

  switch (kind) {
    case "executive":
      return {
        ...base,
        title: "Executive Dashboard",
        widgets: [
          { id: "health", title: "Platform Health", type: "status", data: { status: input.health.overall } },
          { id: "spend", title: "Total Spend", type: "stat", data: { value: input.costs.total, projected: input.costs.projectedMonthly } },
          { id: "tokens", title: "Total Tokens", type: "stat", data: { value: input.tokens.totalTokens } },
          { id: "alerts", title: "Active Alerts", type: "stat", data: { value: input.alerts.filter((a) => !a.resolvedAt).length } },
        ],
      };
    case "operations":
      return {
        ...base,
        title: "Operations Dashboard",
        widgets: [
          { id: "components", title: "Component Health", type: "table", data: { rows: input.health.components } },
          { id: "latency", title: "Latency Spans", type: "series", data: { points: input.spans.slice(-20).map((s) => ({ name: s.name, ms: s.durationMs })) } },
          { id: "queue", title: "Queue Metrics", type: "series", data: { points: input.metrics.filter((m) => m.name.startsWith("queue.")) } },
        ],
      };
    case "provider":
      return {
        ...base,
        title: "Provider Dashboard",
        widgets: [
          { id: "by_provider", title: "Spend by Provider", type: "table", data: { map: input.costs.byProvider } },
          { id: "provider_spans", title: "Provider Spans", type: "table", data: { rows: input.spans.filter((s) => s.surface === "provider").slice(-20) } },
        ],
      };
    case "cost":
      return {
        ...base,
        title: "Cost Dashboard",
        widgets: [
          { id: "total", title: "Total", type: "stat", data: { value: input.costs.total } },
          { id: "orgs", title: "By Organization", type: "table", data: { map: input.costs.byOrganization } },
          { id: "caps", title: "By Capability", type: "table", data: { map: input.costs.byCapability } },
          { id: "proj", title: "Projected Monthly", type: "stat", data: { value: input.costs.projectedMonthly } },
        ],
      };
    case "capability":
      return {
        ...base,
        title: "Capability Dashboard",
        widgets: [
          { id: "cap_cost", title: "Cost by Capability", type: "table", data: { map: input.costs.byCapability } },
          { id: "cap_spans", title: "Capability Spans", type: "table", data: { rows: input.spans.filter((s) => s.surface === "capability_intelligence").slice(-20) } },
        ],
      };
    case "organization":
      return {
        ...base,
        title: "Organization Dashboard",
        widgets: [
          { id: "org_cost", title: "Spend by Org", type: "table", data: { map: input.costs.byOrganization } },
          { id: "org_tokens", title: "Tokens", type: "stat", data: { value: input.tokens.totalTokens } },
        ],
      };
    case "engineering":
    default:
      return {
        ...base,
        title: "Engineering Dashboard",
        widgets: [
          { id: "errors", title: "Error Spans", type: "table", data: { rows: input.spans.filter((s) => s.status === "error").slice(-20) } },
          { id: "metrics", title: "Recent Metrics", type: "series", data: { points: input.metrics.slice(-30) } },
          { id: "alerts", title: "Alerts", type: "table", data: { rows: input.alerts.slice(-20) } },
        ],
      };
  }
}
