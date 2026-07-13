/**
 * Routing platform enumerations.
 */

export type RoutingStrategyKind =
  | "lowest_cost"
  | "lowest_latency"
  | "highest_quality"
  | "provider_preference"
  | "compliance"
  | "health_first"
  | "balanced"
  | "weighted"
  | "random"
  | "sticky"
  | "canary"
  | "shadow"
  | "multi_provider";

export type LoadBalancingKind =
  | "round_robin"
  | "weighted"
  | "least_loaded"
  | "priority"
  | "random";

export type ExperimentKind = "canary" | "shadow" | "ab_test" | "weighted_rollout";

export type RoutingHealthState = "healthy" | "degraded" | "unhealthy" | "unknown";

export type ComplianceVerdict = "allowed" | "denied" | "conditional";

export type FailoverKind =
  | "fallback_chain"
  | "retry_routing"
  | "regional_fallback"
  | "multi_provider";
