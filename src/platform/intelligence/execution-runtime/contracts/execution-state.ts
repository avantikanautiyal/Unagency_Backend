/**
 * Execution runtime states and transition rules.
 */

export type ExecutionState =
  | "created"
  | "queued"
  | "preparing"
  | "running"
  | "waiting"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
  | "timed_out";

const TRANSITIONS: Readonly<Record<ExecutionState, readonly ExecutionState[]>> = {
  created: ["queued", "preparing", "cancelled"],
  queued: ["preparing", "cancelled", "timed_out"],
  preparing: ["running", "failed", "cancelled", "timed_out"],
  running: ["waiting", "paused", "completed", "failed", "cancelled", "timed_out"],
  waiting: ["running", "paused", "failed", "cancelled", "timed_out"],
  paused: ["running", "cancelled", "timed_out"],
  completed: [],
  failed: [],
  cancelled: [],
  timed_out: [],
};

export function canTransitionExecutionState(
  from: ExecutionState,
  to: ExecutionState
): boolean {
  if (from === to) {
    return true;
  }
  return TRANSITIONS[from].includes(to);
}

export function isTerminalExecutionState(state: ExecutionState): boolean {
  return TRANSITIONS[state].length === 0;
}
