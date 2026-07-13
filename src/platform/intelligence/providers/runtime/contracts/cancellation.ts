/**
 * Cancellation token contract.
 *
 * Purpose: Immutable snapshot of cancellation state.
 * Responsibilities: Expose cancelled flag and optional reason.
 * Usage: Read by the execution pipeline and dispatchers.
 * Future Extension: Deadline-based cancellation metadata.
 */

export interface CancellationToken {
  readonly cancelled: boolean;
  readonly reason?: string;
}

export const UNCANCELLED_TOKEN: CancellationToken = { cancelled: false };
