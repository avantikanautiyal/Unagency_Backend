/**
 * Execution runtime event types.
 * Published via existing IEventBus (string-compatible event types).
 */

export const ExecutionEventTypes = {
  EXECUTION_CREATED: "intelligence.execution.created",
  EXECUTION_STARTED: "intelligence.execution.started",
  EXECUTION_PAUSED: "intelligence.execution.paused",
  EXECUTION_RESUMED: "intelligence.execution.resumed",
  EXECUTION_COMPLETED: "intelligence.execution.completed",
  EXECUTION_FAILED: "intelligence.execution.failed",
  EXECUTION_CANCELLED: "intelligence.execution.cancelled",
} as const;

export type ExecutionEventType =
  (typeof ExecutionEventTypes)[keyof typeof ExecutionEventTypes];

export interface ExecutionEventPayload {
  readonly sessionId: string;
  readonly executionId: string;
  readonly state: string;
  readonly planId?: string;
  readonly message?: string;
}
