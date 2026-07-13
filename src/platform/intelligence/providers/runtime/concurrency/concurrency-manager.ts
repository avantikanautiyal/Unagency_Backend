/**
 * Concurrency manager.
 *
 * Purpose: Bound concurrent executions via reservations and leases.
 * Responsibilities: Reserve capacity, acquire/release leases, report capacity.
 * Usage: The runtime reserves before dispatch and releases on completion.
 * Future Extension: Distributed coordination (explicitly out of scope for M4.1).
 */

import type { ProviderId } from "../../../shared/identifiers";
import { failure, success } from "../../../shared/result";
import type { Result } from "../../../shared/result";
import type {
  ExecutionLease,
  ExecutionReservation,
} from "../contracts/queue";
import { ConcurrencyLimitError, ProviderRuntimeError } from "../errors";
import type { IConcurrencyManager } from "../interfaces/concurrency-manager";

export interface ConcurrencyManagerDependencies {
  readonly maxConcurrent: number;
  readonly nowIso?: () => string;
  readonly createId?: (prefix: string) => string;
}

export class ConcurrencyManager implements IConcurrencyManager {
  readonly max: number;
  private readonly nowIso: () => string;
  private readonly createId: (prefix: string) => string;
  private readonly leases = new Map<string, ExecutionLease>();
  private readonly reservations = new Map<string, ExecutionReservation>();
  private counter = 0;

  constructor(deps: ConcurrencyManagerDependencies) {
    this.max = Math.max(1, deps.maxConcurrent);
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.createId =
      deps.createId ?? ((prefix) => `${prefix}_${(this.counter += 1)}`);
  }

  get active(): number {
    return this.leases.size;
  }

  get reserved(): number {
    return this.reservations.size;
  }

  hasCapacity(): boolean {
    return this.leases.size + this.reservations.size < this.max;
  }

  reserve(
    sessionId: string,
    providerId: ProviderId
  ): Result<ExecutionReservation> {
    if (!this.hasCapacity()) {
      return failure(
        new ConcurrencyLimitError("No execution capacity available", {
          sessionId,
          active: this.active,
          reserved: this.reserved,
          max: this.max,
        })
      );
    }
    const reservation: ExecutionReservation = {
      reservationId: this.createId("resv"),
      sessionId,
      providerId,
      reservedAt: this.nowIso(),
    };
    this.reservations.set(reservation.reservationId, reservation);
    return success(reservation);
  }

  acquire(
    reservation: ExecutionReservation,
    ownerId: string
  ): Result<ExecutionLease> {
    if (!this.reservations.has(reservation.reservationId)) {
      return failure(
        new ProviderRuntimeError("Reservation not found or already consumed", {
          reservationId: reservation.reservationId,
        })
      );
    }
    this.reservations.delete(reservation.reservationId);
    const lease: ExecutionLease = {
      leaseId: this.createId("lease"),
      sessionId: reservation.sessionId,
      ownerId,
      acquiredAt: this.nowIso(),
    };
    this.leases.set(lease.leaseId, lease);
    return success(lease);
  }

  release(leaseId: string): Result<void> {
    if (!this.leases.has(leaseId)) {
      return failure(
        new ProviderRuntimeError("Lease not found", { leaseId })
      );
    }
    this.leases.delete(leaseId);
    return success(undefined);
  }

  releaseReservation(reservationId: string): Result<void> {
    if (!this.reservations.has(reservationId)) {
      return failure(
        new ProviderRuntimeError("Reservation not found", { reservationId })
      );
    }
    this.reservations.delete(reservationId);
    return success(undefined);
  }
}
