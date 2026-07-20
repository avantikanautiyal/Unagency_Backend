/**
 * Production Observability & AIOps Platform.
 *
 * Observes the platform — never executes AI.
 * Consumes public interfaces only (additive collectors).
 */

export * from "./contracts";
export * from "./interfaces";
export * from "./constants";
export { ObservabilityEngine } from "./engine/observability-engine";
export { InMemoryTelemetryStore } from "./tracing/in-memory-telemetry-store";
export { aggregateCosts } from "./costs/cost-intelligence";
export { aggregateTokens } from "./tokens/token-intelligence";
export { aggregateHealth } from "./health/health-aggregator";
export { evaluateAlerts } from "./alerts/alert-evaluator";
export { buildDashboard } from "./dashboards/dashboard-builder";
export { buildDiagnostic } from "./diagnostics/diagnostic-builder";
export { generateReport } from "./reporting/report-generator";
export { applyRetention } from "./retention/retention";
export { exportTelemetry } from "./exports/export-telemetry";
export {
  collectFromIntegrationReport,
  collectFromExecutionMetrics,
} from "./analytics/collectors";
export { ObservabilityEventBuilder } from "./builders/observability-event-builder";
export {
  createObservabilityPlatform,
  type ObservabilityPlatform,
  type CreateObservabilityOptions,
} from "./factories/create-observability-platform";
export { sanitizeLogMessage } from "./logs/sanitize";
