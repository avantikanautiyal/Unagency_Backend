/**
 * Provider operation state machine — async provider durable lifecycle.
 */

export type ProviderOperationState =
  | "created"
  | "submitting"
  | "submitted"
  | "pending"
  | "completed"
  | "result_ingesting"
  | "artifact_created"
  | "failed"
  | "cancelled";

export const TERMINAL_PROVIDER_OPERATION_STATES: readonly ProviderOperationState[] = [
  "failed",
  "cancelled",
  "artifact_created",
];

export function isTerminalProviderOperationState(state: ProviderOperationState): boolean {
  return TERMINAL_PROVIDER_OPERATION_STATES.includes(state);
}

export function canTransitionProviderOperation(
  from: ProviderOperationState,
  to: ProviderOperationState
): boolean {
  if (isTerminalProviderOperationState(from)) return false;
  const allowed: Record<ProviderOperationState, readonly ProviderOperationState[]> = {
    created: ["submitting", "failed", "cancelled"],
    submitting: ["submitted", "failed", "cancelled"],
    submitted: ["pending", "failed", "cancelled"],
    pending: ["completed", "failed", "cancelled"],
    completed: ["result_ingesting", "failed"],
    result_ingesting: ["artifact_created", "failed", "completed"],
    artifact_created: [],
    failed: [],
    cancelled: [],
  };
  return allowed[from]?.includes(to) ?? false;
}
