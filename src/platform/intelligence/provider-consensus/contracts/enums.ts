/** Provider Consensus enums. */

export type ConsensusStrategyKind =
  | "single_winner"
  | "highest_confidence"
  | "weighted_voting"
  | "majority_vote"
  | "best_quality"
  | "lowest_cost"
  | "lowest_latency"
  | "research_writing"
  | "reviewer_pattern"
  | "committee_pattern"
  | "hierarchical"
  | "hybrid";

export type ConsensusRole =
  | "primary"
  | "research"
  | "writing"
  | "reviewer"
  | "verifier"
  | "committee_member"
  | "supporting"
  | "alternative";

export type MergeMode =
  | "none"
  | "paragraphs"
  | "json"
  | "structured"
  | "citations"
  | "summaries"
  | "code"
  | "reasoning";

export type ComparisonDimension =
  | "quality"
  | "cost"
  | "latency"
  | "structure"
  | "reasoning"
  | "brand"
  | "safety"
  | "compliance"
  | "evidence"
  | "confidence";
