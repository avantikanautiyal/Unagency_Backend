/**
 * Step 9 — Experiment lifecycle states (separate from benchmark outcome).
 */

export type ExperimentStatus =
  | "PLANNED"
  | "RUNNING"
  | "COMPLETED"
  | "PARTIAL"
  | "BLOCKED"
  | "INCOMPARABLE";

export type ExperimentCellStatus =
  | "PLANNED"
  | "SKIPPED_NOT_APPLICABLE"
  | "SKIPPED_INCOMPATIBLE"
  | "EXECUTED"
  | "FAILED"
  | "INCOMPARABLE";
