/**
 * Lifecycle phase labels for monitoring (distinct from state machine states).
 */

export type ExecutionLifecyclePhase =
  | "idle"
  | "starting"
  | "active"
  | "pausing"
  | "resuming"
  | "cancelling"
  | "finishing"
  | "disposed";
