/**
 * Execution lifecycle phases.
 *
 * Purpose: Name the ordered phases of a provider execution lifecycle.
 * Responsibilities: Provide a canonical phase enum and ordering helper.
 * Usage: Documentation and optional phase tracking.
 * Future Extension: Phase-level hooks and callbacks.
 *
 * Lifecycle:
 *   create → reserve → queue → dispatch → execute → stream → complete → snapshot
 */

export type ExecutionLifecyclePhase =
  | "create"
  | "reserve"
  | "queue"
  | "dispatch"
  | "execute"
  | "stream"
  | "complete"
  | "snapshot";

export const EXECUTION_LIFECYCLE_ORDER: readonly ExecutionLifecyclePhase[] = [
  "create",
  "reserve",
  "queue",
  "dispatch",
  "execute",
  "stream",
  "complete",
  "snapshot",
];

export function lifecyclePhaseOrder(phase: ExecutionLifecyclePhase): number {
  return EXECUTION_LIFECYCLE_ORDER.indexOf(phase);
}
