/**
 * Negotiation platform enumerations.
 *
 * Purpose: Closed unions shared across the negotiation module.
 * Responsibilities: Decisions, stages, features, constraints, risk.
 * Usage: Referenced by contracts and negotiators.
 * Future Extension: Additional stages/features without breaking callers.
 */

export type NegotiationDecision =
  | "accepted"
  | "accepted_with_warnings"
  | "rejected";

export type NegotiationStage =
  | "capability"
  | "provider"
  | "model"
  | "constraint"
  | "identity"
  | "policy"
  | "feature"
  | "budget"
  | "regional"
  | "quality"
  | "decision";

export const NEGOTIATION_STAGE_ORDER: readonly NegotiationStage[] = [
  "capability",
  "provider",
  "model",
  "constraint",
  "identity",
  "policy",
  "feature",
  "budget",
  "regional",
  "quality",
  "decision",
];

/**
 * Features that can be negotiated for an execution.
 */
export type NegotiableFeature =
  | "streaming"
  | "functions"
  | "vision"
  | "images"
  | "audio"
  | "reasoning"
  | "tools"
  | "embeddings"
  | "json_mode"
  | "response_format"
  | "safety";

export type ConstraintKind =
  | "timeout"
  | "retry"
  | "budget"
  | "latency"
  | "priority"
  | "execution_mode"
  | "human_review"
  | "evaluation";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type PreferenceKind =
  | "latency"
  | "cost"
  | "quality"
  | "provider"
  | "model";

/**
 * Provider/capability maturity derived from lifecycle status.
 */
export type MaturityLevel =
  | "experimental"
  | "beta"
  | "stable"
  | "deprecated"
  | "unavailable";
