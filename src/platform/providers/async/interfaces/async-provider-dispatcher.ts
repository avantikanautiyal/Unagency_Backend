/**
 * Async-capable provider dispatcher extension.
 * Sync providers implement IProviderDispatcher only.
 */

import type { ProviderId } from "../../../core/identifiers";
import type { Result } from "../../../core/result";
import type { CancellationToken } from "../../runtime/contracts/cancellation";
import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import type { IProviderDispatcher } from "../../runtime/interfaces/provider-dispatcher";
import type {
  ProviderAsyncPollResult,
  ProviderAsyncSubmitResult,
} from "../contracts/provider-operation";

export type ProviderExecutionSemantics = "sync" | "async";

export interface IAsyncProviderDispatcher extends IProviderDispatcher {
  executionSemantics(): ProviderExecutionSemantics;
  supportsCancellation(providerId: ProviderId): boolean;

  submitAsync(
    request: ProviderExecutionRequest,
    token: CancellationToken,
    idempotencyKey: string
  ): Promise<Result<ProviderAsyncSubmitResult>>;

  pollAsync(
    request: ProviderExecutionRequest,
    providerJobId: string,
    token: CancellationToken
  ): Promise<Result<ProviderAsyncPollResult>>;

  cancelAsync?(
    request: ProviderExecutionRequest,
    providerJobId: string,
    token: CancellationToken
  ): Promise<Result<void>>;
}

export function isAsyncProviderDispatcher(
  dispatcher: IProviderDispatcher
): dispatcher is IAsyncProviderDispatcher {
  return (
    typeof (dispatcher as IAsyncProviderDispatcher).executionSemantics === "function" &&
    (dispatcher as IAsyncProviderDispatcher).executionSemantics() === "async"
  );
}
