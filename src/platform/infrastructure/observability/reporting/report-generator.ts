/**
 * Reporting generators.
 */

import type { ObservabilityReport, ReportKind } from "../contracts";
import type { CostIntelligenceSnapshot, TokenIntelligenceSnapshot, PlatformHealthSnapshot } from "../interfaces/observability";
import type { AlertRecord, TraceSpan } from "../contracts/telemetry";

export function generateReport(
  kind: ReportKind,
  periodStart: string,
  periodEnd: string,
  input: {
    health: PlatformHealthSnapshot;
    costs: CostIntelligenceSnapshot;
    tokens: TokenIntelligenceSnapshot;
    alerts: readonly AlertRecord[];
    spans: readonly TraceSpan[];
    createId: (prefix: string) => string;
    nowIso: string;
  }
): ObservabilityReport {
  const inPeriod = input.spans.filter((s) => {
    const t = Date.parse(s.completedAt);
    return t >= Date.parse(periodStart) && t <= Date.parse(periodEnd);
  });

  const common = {
    reportId: input.createId("orep"),
    kind,
    periodStart,
    periodEnd,
    generatedAt: input.nowIso,
  };

  const performance = {
    requests: inPeriod.length,
    errors: inPeriod.filter((s) => s.status === "error").length,
    avgLatencyMs:
      inPeriod.length === 0
        ? 0
        : inPeriod.reduce((n, s) => n + s.durationMs, 0) / inPeriod.length,
  };

  switch (kind) {
    case "cost":
      return {
        ...common,
        summary: { total: input.costs.total, projectedMonthly: input.costs.projectedMonthly },
        sections: [
          { title: "By Organization", data: input.costs.byOrganization },
          { title: "By Provider", data: input.costs.byProvider },
          { title: "By Capability", data: input.costs.byCapability },
        ],
      };
    case "provider":
      return {
        ...common,
        summary: { providers: Object.keys(input.costs.byProvider).length },
        sections: [
          { title: "Spend", data: input.costs.byProvider },
          { title: "Models", data: input.costs.byModel },
        ],
      };
    case "capability":
      return {
        ...common,
        summary: { capabilities: Object.keys(input.costs.byCapability).length },
        sections: [{ title: "Spend by Capability", data: input.costs.byCapability }],
      };
    case "organization":
      return {
        ...common,
        summary: { organizations: Object.keys(input.costs.byOrganization).length },
        sections: [{ title: "Spend by Organization", data: input.costs.byOrganization }],
      };
    case "performance":
      return {
        ...common,
        summary: performance,
        sections: [
          { title: "Tokens", data: { ...input.tokens } },
          { title: "Alerts", data: { count: input.alerts.length } },
        ],
      };
    case "daily":
    case "weekly":
    case "monthly":
    default:
      return {
        ...common,
        summary: {
          health: input.health.overall,
          spend: input.costs.total,
          tokens: input.tokens.totalTokens,
          ...performance,
        },
        sections: [
          { title: "Health", data: { components: input.health.components.length, overall: input.health.overall } },
          { title: "Cost", data: { total: input.costs.total, projected: input.costs.projectedMonthly } },
          { title: "Tokens", data: { total: input.tokens.totalTokens } },
          { title: "Alerts", data: { count: input.alerts.filter((a) => !a.resolvedAt).length } },
        ],
      };
  }
}
