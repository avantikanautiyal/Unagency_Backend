/**
 * Execution Optimization enums.
 */

export type OptimizationDomain =
  | "execution_strategy"
  | "provider_selection"
  | "reasoning_mode"
  | "prompt_structure"
  | "knowledge_ranking"
  | "context_size"
  | "compression"
  | "token_budget"
  | "verification_strategy"
  | "retry_strategy"
  | "streaming_preference"
  | "cost_vs_quality"
  | "latency_vs_quality";

export type RecommendationPriority = "low" | "medium" | "high" | "critical";

export type RecommendationDisposition = "advisory" | "investigate" | "experiment";

export type TrendDirection = "improving" | "declining" | "stable" | "volatile";

export type ConfidenceLevel = "low" | "medium" | "high" | "very_high";

export type SimulationOutcome = "positive" | "neutral" | "negative";

export type ExperimentStatus = "proposed" | "simulated" | "completed";
