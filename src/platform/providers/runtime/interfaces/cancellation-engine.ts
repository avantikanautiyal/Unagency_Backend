/**
 * Cancellation engine ports.
 *
 * Purpose: Create and link cancellation sources for propagation.
 * Responsibilities: Produce sources; wire parent → child cancellation.
 * Usage: The runtime creates one source per session.
 * Future Extension: Deadline/timeout-linked sources.
 */

import type { CancellationToken } from "../contracts/cancellation";

export interface ICancellationSource {
  readonly token: CancellationToken;
  cancel(reason?: string): void;
  /** Register a listener invoked once when cancellation occurs. */
  onCancel(listener: (reason?: string) => void): void;
  /** Resolves when cancellation occurs (used to race against dispatch). */
  whenCancelled(): Promise<{ readonly reason?: string }>;
}

export interface ICancellationEngine {
  createSource(): ICancellationSource;
  /**
   * Create a source that cancels when any parent source cancels.
   * Enables cancellation propagation without distributed coordination.
   */
  createLinkedSource(parents: readonly ICancellationSource[]): ICancellationSource;
}
