export type EntityStatus =
  | "draft"
  | "active"
  | "inactive"
  | "archived"
  | "deleted";

export type PlatformLifecyclePhase =
  | "created"
  | "bootstrapping"
  | "ready"
  | "degraded"
  | "shutting_down"
  | "stopped"
  | "failed";

export type HealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown";
