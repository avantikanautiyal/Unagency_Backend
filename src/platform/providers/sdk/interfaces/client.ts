/**
 * Provider SDK client ports.
 *
 * Purpose: Stable internal interface every SDK wrapper implements.
 * Responsibilities: execute, stream, health, describe, authenticate, shutdown.
 * Usage: Resolved by the registry; invoked by the engine.
 * Future Extension: Batch execute, async iterators.
 *
 * Wrappers NEVER expose vendor SDK objects or responses.
 */

import type { Result } from "../../../core/result";
import type { SdkVendor } from "../contracts/enums";
import type { SdkAuthentication } from "../contracts/authentication";
import type { SdkClientDescriptor } from "../contracts/descriptors";
import type { SdkExecutionContext } from "../contracts/context";
import type { SdkRequest, SdkResponse } from "../contracts/request-response";
import type { SdkHealth } from "../contracts/health-result";
import type { SdkStreamingChunk } from "../contracts/health-result";

export interface IProviderSdkClient {
  readonly vendor: SdkVendor;
  describe(): SdkClientDescriptor;
  execute(
    request: SdkRequest,
    context: SdkExecutionContext
  ): Promise<Result<SdkResponse>>;
  stream(
    request: SdkRequest,
    context: SdkExecutionContext
  ): Promise<Result<AsyncIterable<SdkStreamingChunk>>>;
  health(): Result<SdkHealth>;
  authenticate(auth: SdkAuthentication): Promise<Result<void>>;
  shutdown(): Promise<Result<void>>;
}

/** Specialized SDK interfaces — each provider wrapper implements its own. */
export interface IOpenAISdk extends IProviderSdkClient {}
