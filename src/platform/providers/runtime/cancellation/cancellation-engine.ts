/**
 * Cancellation source and engine.
 *
 * Purpose: Provide cancellable tokens with listener-based propagation.
 * Responsibilities: Track cancellation; notify listeners; link parents to children.
 * Usage: One source per session; linked sources enable propagation.
 * Future Extension: Deadline-linked cancellation.
 */

import type { CancellationToken } from "../contracts/cancellation";
import type {
  ICancellationEngine,
  ICancellationSource,
} from "../interfaces/cancellation-engine";

export class CancellationSource implements ICancellationSource {
  private _cancelled = false;
  private _reason?: string;
  private readonly listeners: Array<(reason?: string) => void> = [];
  private readonly waiters: Array<(result: { reason?: string }) => void> = [];

  get token(): CancellationToken {
    return { cancelled: this._cancelled, reason: this._reason };
  }

  cancel(reason?: string): void {
    if (this._cancelled) {
      return;
    }
    this._cancelled = true;
    this._reason = reason;
    for (const listener of this.listeners) {
      listener(reason);
    }
    for (const waiter of this.waiters) {
      waiter({ reason });
    }
    this.listeners.length = 0;
    this.waiters.length = 0;
  }

  onCancel(listener: (reason?: string) => void): void {
    if (this._cancelled) {
      listener(this._reason);
      return;
    }
    this.listeners.push(listener);
  }

  whenCancelled(): Promise<{ readonly reason?: string }> {
    if (this._cancelled) {
      return Promise.resolve({ reason: this._reason });
    }
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }
}

export class CancellationEngine implements ICancellationEngine {
  createSource(): ICancellationSource {
    return new CancellationSource();
  }

  createLinkedSource(
    parents: readonly ICancellationSource[]
  ): ICancellationSource {
    const child = new CancellationSource();
    for (const parent of parents) {
      parent.onCancel((reason) => child.cancel(reason));
    }
    return child;
  }
}
