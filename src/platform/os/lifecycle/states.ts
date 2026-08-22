/**
 * Canonical OS lifecycle states — single source of truth for "where is this execution?"
 * Public API ExecutionResource.status remains the external contract; osLifecycle is internal/extras.
 */

export const OS_LIFECYCLE_STATES = [
  "RECEIVED",
  "PLANNING",
  "CONTEXT_ASSEMBLY",
  "ORCHESTRATING",
  "EXECUTING",
  "EVALUATING",
  "VALIDATING",
  "GOVERNANCE",
  "AWAITING_REVIEW",
  "APPROVED",
  "DELIVERING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;

export type OsLifecycleState = (typeof OS_LIFECYCLE_STATES)[number];

const ALLOWED: Readonly<Record<OsLifecycleState, readonly OsLifecycleState[]>> = {
  RECEIVED: ["PLANNING", "CONTEXT_ASSEMBLY", "FAILED", "CANCELLED"],
  PLANNING: ["CONTEXT_ASSEMBLY", "ORCHESTRATING", "FAILED", "CANCELLED"],
  CONTEXT_ASSEMBLY: ["ORCHESTRATING", "EXECUTING", "FAILED", "CANCELLED"],
  ORCHESTRATING: ["EXECUTING", "FAILED", "CANCELLED"],
  EXECUTING: ["EVALUATING", "AWAITING_REVIEW", "FAILED", "CANCELLED"],
  EVALUATING: ["VALIDATING", "GOVERNANCE", "FAILED", "CANCELLED"],
  VALIDATING: ["GOVERNANCE", "FAILED", "CANCELLED"],
  GOVERNANCE: ["AWAITING_REVIEW", "APPROVED", "DELIVERING", "FAILED", "CANCELLED"],
  AWAITING_REVIEW: ["APPROVED", "FAILED", "CANCELLED", "ORCHESTRATING"],
  APPROVED: ["DELIVERING", "COMPLETED", "FAILED", "CANCELLED"],
  DELIVERING: ["COMPLETED", "FAILED", "CANCELLED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

export class OsLifecycleTransitionError extends Error {
  constructor(
    readonly from: OsLifecycleState,
    readonly to: OsLifecycleState
  ) {
    super(`Invalid OS lifecycle transition: ${from} → ${to}`);
    this.name = "OsLifecycleTransitionError";
  }
}

export function canTransitionOsLifecycle(
  from: OsLifecycleState,
  to: OsLifecycleState
): boolean {
  if (from === to) return true;
  return (ALLOWED[from] ?? []).includes(to);
}

export function transitionOsLifecycle(
  from: OsLifecycleState,
  to: OsLifecycleState
): OsLifecycleState {
  if (!canTransitionOsLifecycle(from, to)) {
    throw new OsLifecycleTransitionError(from, to);
  }
  return to;
}

/** Map existing API execution status → approximate OS lifecycle (best-effort). */
export function osLifecycleFromApiStatus(
  status: string
): OsLifecycleState {
  switch (status) {
    case "queued":
    case "pending":
      return "RECEIVED";
    case "running":
      return "EXECUTING";
    case "awaiting_approval":
      return "AWAITING_REVIEW";
    case "succeeded":
    case "completed":
      return "COMPLETED";
    case "failed":
      return "FAILED";
    case "cancelled":
    case "canceled":
      return "CANCELLED";
    default:
      return "RECEIVED";
  }
}
