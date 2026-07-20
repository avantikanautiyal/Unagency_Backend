/**
 * Diagnostics — root cause and timelines from traces.
 */

import type { DiagnosticReport, TraceSpan } from "../contracts/telemetry";

export function buildDiagnostic(
  correlationId: string,
  spans: readonly TraceSpan[],
  createId: (prefix: string) => string,
  nowIso: string
): DiagnosticReport {
  const related = spans
    .filter((s) => s.context.correlationId === correlationId)
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));

  const failures = related.filter((s) => s.status === "error");
  const root = failures[0];

  return {
    diagnosticId: createId("diag"),
    correlationId,
    rootCause: root
      ? `${root.surface}/${root.name}: ${root.errorMessage ?? "error"}`
      : related.length
        ? "No error spans — timeline available for inspection"
        : "No spans found for correlation",
    failureTimeline: failures,
    dependencyTimeline: related.map((s) => `${s.startedAt} ${s.surface}:${s.name} (${s.durationMs}ms)`),
    providerTimeline: related
      .filter((s) => s.surface === "provider" || s.surface === "runtime")
      .map((s) => `${s.startedAt} provider=${s.context.providerId ?? "?"} model=${s.context.modelId ?? "?"} ${s.durationMs}ms`),
    workerTimeline: related
      .filter((s) => s.surface === "worker" || s.surface === "queue" || s.surface === "distributed_execution")
      .map((s) => `${s.startedAt} ${s.name} ${s.status}`),
    capabilityTimeline: related
      .filter((s) => s.surface === "capability_intelligence" || Boolean(s.context.capabilityId))
      .map((s) => `${s.startedAt} capability=${s.context.capabilityId ?? s.name}`),
    generatedAt: nowIso,
  };
}
