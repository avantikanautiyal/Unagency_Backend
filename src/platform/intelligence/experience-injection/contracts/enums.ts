/** Experience Injection enumerations. */

export type InjectionMode = "full" | "top_n" | "advisory";

export type ConflictResolutionStrategy =
  | "highest_confidence"
  | "highest_evidence"
  | "most_applicable"
  | "most_recent"
  | "prefer_trusted_lifecycle";

export type SimilarityMatchKind =
  | "exact"
  | "partial"
  | "semantic_placeholder"
  | "none";

export type PackagedExperienceKind =
  | "relevant"
  | "correction"
  | "best_practice"
  | "warning"
  | "anti_pattern"
  | "optimization";
