/** Capability Intelligence enumerations. */

export type CapabilityMaturity =
  | "experimental"
  | "preview"
  | "stable"
  | "enterprise"
  | "deprecated";

export type CapabilityLifecycleState =
  | "draft"
  | "active"
  | "evolving"
  | "frozen"
  | "retired";

export type CostTier = "low" | "medium" | "high" | "premium";
export type LatencyTier = "realtime" | "fast" | "standard" | "batch";
export type ComplexityTier = "simple" | "moderate" | "complex" | "expert";

export type CompositionShape =
  | "single"
  | "chain"
  | "tree"
  | "dag"
  | "pipeline"
  | "bundle";

export type CapabilityDepartment =
  | "marketing"
  | "design"
  | "video"
  | "software"
  | "research"
  | "business"
  | "legal"
  | "finance"
  | "operations"
  | "general";

export type CapabilityCategory =
  | "generation"
  | "analysis"
  | "review"
  | "transformation"
  | "planning"
  | "orchestration"
  | "evaluation";
