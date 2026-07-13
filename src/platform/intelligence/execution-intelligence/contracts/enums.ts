/**
 * Execution Intelligence enums.
 */

export type ExecutionStrategyKind =
  | "single_pass"
  | "multi_pass"
  | "reasoning_first"
  | "research_first"
  | "plan_first"
  | "generate_review_improve"
  | "tree_of_thought"
  | "reflection"
  | "self_verification"
  | "parallel_generation"
  | "consensus_generation";

export type ExecutionModeKind =
  | "fast"
  | "balanced"
  | "quality"
  | "research"
  | "reasoning"
  | "conservative";

export type RiskSeverity = "low" | "medium" | "high" | "critical";

export type RiskCategory =
  | "prompt_ambiguity"
  | "missing_context"
  | "knowledge_gap"
  | "conflicting_instructions"
  | "token_overflow"
  | "policy_risk";

export type VerificationKind =
  | "self_review"
  | "cross_check"
  | "fact_verification"
  | "schema_validation"
  | "human_review"
  | "second_pass_refinement";

export type OptimizationDimension =
  | "context_size"
  | "context_relevance"
  | "context_ordering"
  | "knowledge_ranking"
  | "knowledge_compression"
  | "prompt_structure"
  | "token_budget"
  | "reasoning_depth"
  | "verification_depth";

export type HeuristicKind =
  | "complexity"
  | "ambiguity"
  | "knowledge_density"
  | "instruction_count"
  | "constraint_count"
  | "output_schema";
