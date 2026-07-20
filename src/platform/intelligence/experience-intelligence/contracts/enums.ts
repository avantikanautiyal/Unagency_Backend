/** Experience Intelligence enumerations. */

export type ExperienceCategory =
  | "positive"
  | "negative"
  | "warning"
  | "anti_pattern"
  | "best_practice"
  | "correction"
  | "optimization"
  | "safety"
  | "brand"
  | "governance"
  | "workflow"
  | "prompt"
  | "reasoning"
  | "agent_collaboration"
  | "provider"
  | "model"
  | "capability"
  | "department";

export type ExperienceType = ExperienceCategory;

export type ExperienceLifecycle =
  | "draft"
  | "validated"
  | "trusted"
  | "preferred"
  | "deprecated"
  | "archived";

export type RootCauseKind =
  | "weak_cta"
  | "brand_mismatch"
  | "hallucination"
  | "wrong_reasoning_strategy"
  | "wrong_workflow"
  | "wrong_agent_role"
  | "prompt_ambiguity"
  | "missing_context"
  | "insufficient_knowledge"
  | "incorrect_capability"
  | "poor_model_choice"
  | "budget_restriction"
  | "governance_block"
  | "latency_exceeded"
  | "cost_overrun"
  | "unknown";

export type CorrectionKind =
  | "include_cta"
  | "adjust_tone"
  | "avoid_terminology"
  | "increase_reasoning_depth"
  | "enable_chain_of_thought"
  | "increase_context_window"
  | "switch_workflow"
  | "require_human_review"
  | "use_different_capability"
  | "avoid_hashtags_luxury"
  | "switch_model"
  | "switch_provider"
  | "add_knowledge"
  | "clarify_prompt"
  | "custom";
