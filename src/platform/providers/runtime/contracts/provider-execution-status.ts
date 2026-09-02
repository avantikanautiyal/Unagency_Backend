/**
 * Provider execution status (session states) and transition rules.
 *
 * Purpose: Enumerate the lifecycle states of a provider execution session.
 * Responsibilities: Define legal transitions between states.
 * Usage: Owned by the session state machine.
 * Future Extension: Additional states (e.g. "throttled") without breaking callers.
 */

export type ProviderExecutionStatus =
  | "created"
  | "queued"
  | "reserved"
  | "dispatching"
  | "waiting"
  | "streaming"
  | "completed"
  | "cancelled"
  | "timed_out"
  | "failed";

const TRANSITIONS: Readonly<
  Record<ProviderExecutionStatus, readonly ProviderExecutionStatus[]>
> = {
  created: ["queued", "reserved", "cancelled"],
  queued: ["reserved", "cancelled", "timed_out"],
  reserved: ["dispatching", "cancelled", "timed_out", "failed"],
  dispatching: ["waiting", "streaming", "completed", "failed", "cancelled", "timed_out"],
  waiting: ["streaming", "completed", "failed", "cancelled", "timed_out"],
  streaming: ["completed", "failed", "cancelled", "timed_out"],
  completed: [],
  cancelled: [],
  timed_out: [],
  failed: [],
};

export function canTransitionProviderExecutionStatus(
  from: ProviderExecutionStatus,
  to: ProviderExecutionStatus
): boolean {
  if (from === to) {
    return true;
  }
  return TRANSITIONS[from].includes(to);
}

export function isTerminalProviderExecutionStatus(
  status: ProviderExecutionStatus
): boolean {
  return TRANSITIONS[status].length === 0;
}

export function isSuccessfulProviderExecutionStatus(
  status: ProviderExecutionStatus
): boolean {
  return status === "completed";
}
