/**
 * Worker leasing and job reservations.
 */

import type { JobId, LeaseId, ReservationId, WorkerId } from "../contracts/job";
import { asLeaseId, asReservationId } from "../contracts/job";

export interface WorkerLease {
  readonly leaseId: LeaseId;
  readonly workerId: WorkerId;
  readonly jobId: JobId;
  readonly expiresAtMs: number;
}

export interface JobReservation {
  readonly reservationId: ReservationId;
  readonly workerId: WorkerId;
  readonly jobId: JobId;
  readonly reservedAtMs: number;
}

export class LeaseManager {
  private readonly leases = new Map<string, WorkerLease>();

  constructor(
    private readonly createId: (prefix: string) => string,
    private readonly clockMs: () => number
  ) {}

  acquire(workerId: WorkerId, jobId: JobId, ttlMs: number): WorkerLease {
    const lease: WorkerLease = {
      leaseId: asLeaseId(this.createId("lease")),
      workerId,
      jobId,
      expiresAtMs: this.clockMs() + ttlMs,
    };
    this.leases.set(String(lease.leaseId), lease);
    return lease;
  }

  renew(leaseId: LeaseId, ttlMs: number): WorkerLease | undefined {
    const existing = this.leases.get(String(leaseId));
    if (!existing) return undefined;
    const next = { ...existing, expiresAtMs: this.clockMs() + ttlMs };
    this.leases.set(String(leaseId), next);
    return next;
  }

  release(leaseId: LeaseId): void {
    this.leases.delete(String(leaseId));
  }

  isExpired(leaseId: LeaseId): boolean {
    const lease = this.leases.get(String(leaseId));
    if (!lease) return true;
    return this.clockMs() > lease.expiresAtMs;
  }

  activeCount(): number {
    let n = 0;
    for (const lease of this.leases.values()) {
      if (this.clockMs() <= lease.expiresAtMs) n += 1;
    }
    return n;
  }
}

export class ReservationManager {
  private readonly reservations = new Map<string, JobReservation>();

  constructor(
    private readonly createId: (prefix: string) => string,
    private readonly clockMs: () => number
  ) {}

  reserve(workerId: WorkerId, jobId: JobId): JobReservation {
    const reservation: JobReservation = {
      reservationId: asReservationId(this.createId("res")),
      workerId,
      jobId,
      reservedAtMs: this.clockMs(),
    };
    this.reservations.set(String(reservation.reservationId), reservation);
    return reservation;
  }

  release(reservationId: ReservationId): void {
    this.reservations.delete(String(reservationId));
  }
}
