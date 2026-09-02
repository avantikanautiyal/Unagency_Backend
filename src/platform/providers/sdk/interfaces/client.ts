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
export interface IAnthropicSdk extends IProviderSdkClient {}
export interface IGeminiSdk extends IProviderSdkClient {}
export interface IGroqSdk extends IProviderSdkClient {}
export interface IDeepSeekSdk extends IProviderSdkClient {}
export interface IMistralSdk extends IProviderSdkClient {}
export interface IOpenRouterSdk extends IProviderSdkClient {}
export interface ITogetherSdk extends IProviderSdkClient {}
export interface IFireworksSdk extends IProviderSdkClient {}
export interface ICohereSdk extends IProviderSdkClient {}
export interface IXaiSdk extends IProviderSdkClient {}
