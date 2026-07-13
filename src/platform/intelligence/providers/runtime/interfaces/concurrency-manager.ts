/**
 * Concurrency manager port.
 *
 * Purpose: Bound concurrent executions via reservations and leases.
 * Responsibilities: Reserve capacity, acquire/release leases, report capacity.
 * Usage: The runtime reserves before dispatch and releases on completion.
 * Future Extension: Distributed leases (explicitly out of scope for M4.1).
 */

import type { ProviderId } from "../../../shared/identifiers";
import type { Result } from "../../../shared/result";
import type {
  ExecutionLease,
  ExecutionReservation,
} from "../contracts/queue";

export interface IConcurrencyManager {
  readonly max: number;
  readonly active: number;
  readonly reserved: number;
  hasCapacity(): boolean;
  reserve(
    sessionId: string,
    providerId: ProviderId
  ): Result<ExecutionReservation>;
  acquire(
    reservation: ExecutionReservation,
    ownerId: string
  ): Result<ExecutionLease>;
  release(leaseId: string): Result<void>;
  releaseReservation(reservationId: string): Result<void>;
}
