/**
 * Queue and concurrency contracts.
 *
 * Purpose: Immutable queue item, reservation, and lease shapes.
 * Responsibilities: Describe scheduling, reservation, and ownership records.
 * Usage: Managed by IExecutionQueue and IConcurrencyManager (in-memory only).
 * Future Extension: Durable queue adapters and distributed leases.
 */

import type { ProviderId } from "../../../core/identifiers";

export interface ExecutionQueueItem {
  readonly sessionId: string;
  readonly requestId: string;
  readonly providerId: ProviderId;
  /** Higher priority is dequeued first. */
  readonly priority: number;
  readonly enqueuedAt: string;
  readonly enqueuedAtMs: number;
}

export interface ExecutionReservation {
  readonly reservationId: string;
  readonly sessionId: string;
  readonly providerId: ProviderId;
  readonly reservedAt: string;
}

export interface ExecutionLease {
  readonly leaseId: string;
  readonly sessionId: string;
  readonly ownerId: string;
  readonly acquiredAt: string;
  readonly expiresAt?: string;
}
