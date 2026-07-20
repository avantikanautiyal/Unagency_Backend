/**
 * Observability enumerations.
 */

export type TelemetrySignalKind =
  | "trace_span"
  | "metric"
  | "log"
  | "health"
  | "alert"
  | "cost"
  | "token"
  | "diagnostic";

export type ObservedSurface =
  | "api"
  | "queue"
  | "worker"
  | "integration"
  | "capability_intelligence"
  | "model_intelligence"
  | "negotiation"
  | "routing"
  | "runtime"
  | "provider"
  | "consensus"
  | "evaluation"
  | "learning"
  | "experience"
  | "execution_optimization"
  | "provider_mesh"
  | "secret_platform"
  | "distributed_execution";

export type SpanStatus = "ok" | "error" | "cancelled";

export type HealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown";

export type AlertSeverity = "info" | "warning" | "critical";

export type AlertKind =
  | "latency"
  | "cost"
  | "failure"
  | "provider_down"
  | "queue_saturation"
  | "worker_saturation"
  | "retry_storm"
  | "budget_threshold"
  | "secret_expiration";

export type DashboardKind =
  | "executive"
  | "operations"
  | "provider"
  | "cost"
  | "capability"
  | "organization"
  | "engineering";

export type ReportKind =
  | "daily"
  | "weekly"
  | "monthly"
  | "organization"
  | "provider"
  | "capability"
  | "cost"
  | "performance";

export type RetentionClass = "hot" | "warm" | "cold" | "purge";
