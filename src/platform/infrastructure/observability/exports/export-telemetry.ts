/**
 * Export interfaces — no external sink SDKs.
 */

import type { ExportPayload } from "../contracts/telemetry";
import type { ITelemetryStore } from "../interfaces/observability";

export function exportTelemetry(
  store: ITelemetryStore,
  kind: "traces" | "metrics" | "costs" | "tokens" | "alerts",
  createId: (prefix: string) => string,
  nowIso: string
): ExportPayload {
  const payload =
    kind === "traces"
      ? store.listSpans()
      : kind === "metrics"
        ? store.listMetrics()
        : kind === "costs"
          ? store.listCosts()
          : kind === "tokens"
            ? store.listTokens()
            : store.listAlerts();

  return {
    exportId: createId("oexp"),
    format: "json",
    generatedAt: nowIso,
    itemCount: Array.isArray(payload) ? payload.length : 0,
    payload,
  };
}
