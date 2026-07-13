/**
 * Cancellation source implementation.
 */

import type {
  CancellationToken,
  ICancellationSource,
} from "../contracts/cancellation-token";

export class CancellationSource implements ICancellationSource {
  private _cancelled = false;
  private _reason?: string;

  get token(): CancellationToken {
    return {
      cancelled: this._cancelled,
      reason: this._reason,
    };
  }

  cancel(reason?: string): void {
    this._cancelled = true;
    this._reason = reason;
  }
}
