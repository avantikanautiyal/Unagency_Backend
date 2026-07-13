/**
 * SDK authentication, streaming, retry, timeout, and health ports.
 *
 * Purpose: Cross-cutting SDK concerns as injectable engines.
 * Responsibilities: Auth placeholder; chunk normalization; SDK-only retry/timeout.
 * Usage: Injected into the engine and wrappers.
 * Future Extension: Real OAuth flows, backpressure.
 */

import type { IntelligenceError } from "../../../shared/errors";
import type { Result } from "../../../shared/result";
import type { SdkAuthentication } from "../contracts/authentication";
import type { SdkRetryPolicy } from "../contracts/policies";
import type { SdkVendor } from "../contracts/enums";
import type { SdkExecutionContext } from "../contracts/context";
import type { SdkHealth } from "../contracts/health-result";
import type { SdkStreamingChunk } from "../contracts/health-result";
import type { ProviderWirePayload } from "../../adapters/contracts/adapter-io";

export interface ISdkAuthenticationProvider {
  validate(auth: SdkAuthentication): Result<void>;
  applyHeaders(
    auth: SdkAuthentication
  ): Result<Readonly<Record<string, string>>>;
  refresh(auth: SdkAuthentication): Promise<Result<SdkAuthentication>>;
}

export interface ISdkStreamingEngine {
  normalizeChunk(
    raw: ProviderWirePayload,
    context: SdkExecutionContext,
    sequence: number
  ): Result<SdkStreamingChunk>;
  partial(
    raw: ProviderWirePayload,
    context: SdkExecutionContext,
    sequence: number
  ): Result<SdkStreamingChunk>;
  complete(
    context: SdkExecutionContext,
    sequence: number
  ): Result<SdkStreamingChunk>;
  error(
    message: string,
    context: SdkExecutionContext,
    sequence: number
  ): Result<SdkStreamingChunk>;
}

export interface SdkRetryOutcome<T> {
  readonly result: Result<T>;
  readonly attempts: number;
  readonly retries: number;
}

export interface ISdkRetryEngine {
  execute<T>(
    operation: (attempt: number) => Promise<Result<T>>,
    policy: SdkRetryPolicy,
    isRetryable: (error: IntelligenceError) => boolean
  ): Promise<SdkRetryOutcome<T>>;
}

export interface ISdkTimeoutEngine {
  run<T>(
    operation: () => Promise<Result<T>>,
    timeoutMs: number
  ): Promise<Result<T>>;
}

export interface ISdkHealthMonitor {
  record(vendor: SdkVendor, ok: boolean, latencyMs?: number): void;
  vendorHealth(vendor: SdkVendor): SdkHealth;
  markRegistered(vendor: SdkVendor, registered: boolean): void;
  markConfigured(vendor: SdkVendor, configured: boolean): void;
}
