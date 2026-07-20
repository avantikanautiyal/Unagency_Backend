/** Provider Mesh enumerations. */

export type ProviderOperationalState =
  | "healthy"
  | "busy"
  | "degraded"
  | "unavailable"
  | "maintenance"
  | "experimental"
  | "deprecated"
  | "rate_limited";

export type MeshEventKind =
  | "execution"
  | "health"
  | "telemetry"
  | "certification"
  | "quota"
  | "manual";

export type HintTarget =
  | "routing"
  | "negotiation"
  | "execution_intelligence"
  | "model_intelligence"
  | "consensus";

export type RecommendationPriority = "high" | "medium" | "low";

export type CanaryAction = "start" | "increase" | "hold" | "rollback";
export type ShadowAction = "recommend" | "compare" | "hold";
