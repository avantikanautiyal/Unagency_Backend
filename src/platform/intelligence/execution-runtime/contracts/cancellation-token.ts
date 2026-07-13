/**
 * Cancellation token contracts.
 */

export interface CancellationToken {
  readonly cancelled: boolean;
  readonly reason?: string;
}

export interface ICancellationSource {
  readonly token: CancellationToken;
  cancel(reason?: string): void;
}
