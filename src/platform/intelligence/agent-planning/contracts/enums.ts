/**
 * Agent Planning enumerations.
 */

export type AgentDepartment =
  | "marketing"
  | "software_engineering"
  | "design"
  | "business"
  | "research"
  | "general";

export type CoordinationStrategyKind =
  | "sequential"
  | "parallel"
  | "swarm"
  | "reviewer"
  | "supervisor"
  | "pipeline"
  | "hub_and_spoke"
  | "hierarchical"
  | "coordinator"
  | "consensus";

export type MergeStrategyKind =
  | "sequential_merge"
  | "consensus_merge"
  | "priority_merge"
  | "weighted_merge"
  | "reviewer_merge"
  | "human_merge";

export type ArtifactExchangeKind =
  | "task_artifact"
  | "research_artifact"
  | "brand_artifact"
  | "context_artifact"
  | "knowledge_artifact"
  | "execution_artifact"
  | "review_artifact"
  | "decision_artifact";

export type ReviewAuthorityLevel = "none" | "peer" | "lead" | "director" | "human";

export type EscalationLevel = "agent_retry" | "supervisor" | "human" | "executive";

export type AgentCapacityTier = "low" | "medium" | "high" | "unlimited";

export type TeamPlaybookKind =
  | "marketing_campaign"
  | "product_launch"
  | "software_development"
  | "research"
  | "creative_studio"
  | "sales"
  | "customer_support"
  | "enterprise_consulting";

export type ComplexityRange = "simple" | "moderate" | "complex" | "enterprise";
