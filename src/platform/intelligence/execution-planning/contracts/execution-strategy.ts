/**
 * High-level execution strategy chosen by the planner.
 */

export type ExecutionStrategy =
  | "direct"
  | "fallback_chain"
  | "ensemble"
  | "human_gated";
