/**
 * Provider execution event contracts.
 *
 * Purpose: Lifecycle event types and payload for the provider runtime.
 * Responsibilities: Describe events published over IEventBus.
 * Usage: Published by the runtime; consumed by telemetry/audit bridges.
 * Future Extension: Streaming-chunk and cost events.
 */

import type { ProviderExecutionStatus } from "./provider-execution-status";

export const ProviderExecutionEventTypes = {
  SESSION_CREATED: "intelligence.provider.execution.created",
  SESSION_QUEUED: "intelligence.provider.execution.queued",
  SESSION_RESERVED: "intelligence.provider.execution.reserved",
  SESSION_DISPATCHING: "intelligence.provider.execution.dispatching",
  SESSION_WAITING: "intelligence.provider.execution.waiting",
  SESSION_STREAMING: "intelligence.provider.execution.streaming",
  SESSION_RETRYING: "intelligence.provider.execution.retrying",
  SESSION_COMPLETED: "intelligence.provider.execution.completed",
  SESSION_FAILED: "intelligence.provider.execution.failed",
  SESSION_CANCELLED: "intelligence.provider.execution.cancelled",
  SESSION_TIMED_OUT: "intelligence.provider.execution.timed_out",
} as const;

export type ProviderExecutionEventType =
  (typeof ProviderExecutionEventTypes)[keyof typeof ProviderExecutionEventTypes];

export interface ProviderExecutionEvent {
  readonly sessionId: string;
  readonly requestId: string;
  readonly providerId: string;
  readonly status: ProviderExecutionStatus;
  readonly attempt?: number;
  readonly message?: string;
}
