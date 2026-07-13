/**
 * Registry + engine ports.
 *
 * Purpose: Own adapters and orchestrate the translation pipeline.
 * Responsibilities: register/resolve/list/describe/remove/validate; prepare +
 *   normalize around an (absent, future) network dispatch.
 * Usage: The registry owns adapters; the engine is the platform facade.
 * Future Extension: Multi-adapter fan-out, adapter hot-reload.
 */

import type { ProviderId } from "../../../shared/identifiers";
import type { Result } from "../../../shared/result";
import type { ProviderExecutionResponse } from "../../runtime/contracts/provider-execution-response";
import type { ProviderAdapterDescriptor } from "../contracts/adapter-descriptor";
import type {
  ProviderAdapterRequest,
  ProviderWirePayload,
} from "../contracts/adapter-io";
import type { ProviderDiagnostic, ProviderError } from "../contracts/diagnostics";
import type { ProviderAdapterId } from "../contracts/identifiers";
import type { ProviderValidationResult } from "../contracts/results";
import type { IProviderAdapter } from "./adapter";
import type {
  NormalizeAdapterResponseInput,
  PrepareAdapterExecutionInput,
} from "./inputs";

export interface IProviderAdapterRegistry {
  register(adapter: IProviderAdapter): Result<ProviderAdapterDescriptor>;
  resolve(adapterId: ProviderAdapterId): Result<IProviderAdapter>;
  resolveByProvider(providerId: ProviderId): Result<IProviderAdapter>;
  describe(adapterId: ProviderAdapterId): Result<ProviderAdapterDescriptor>;
  list(): readonly ProviderAdapterDescriptor[];
  remove(adapterId: ProviderAdapterId): Result<void>;
  validate(adapter: IProviderAdapter): Result<ProviderValidationResult>;
}

/**
 * Output of the prepare step: the canonical request + opaque wire payload the
 * (future) runtime would dispatch. The adapter platform performs NO networking.
 */
export interface PreparedAdapterExecution {
  readonly adapterRequest: ProviderAdapterRequest;
  readonly wirePayload: ProviderWirePayload;
  readonly warnings: readonly ProviderDiagnostic[];
}

export interface IProviderAdapterEngine {
  prepare(
    input: PrepareAdapterExecutionInput
  ): Result<PreparedAdapterExecution>;
  finalize(
    input: NormalizeAdapterResponseInput
  ): Result<ProviderExecutionResponse>;
  translateError(
    adapterId: ProviderAdapterId,
    error: unknown,
    request?: ProviderAdapterRequest
  ): ProviderError;
  describe(adapterId: ProviderAdapterId): Result<ProviderAdapterDescriptor>;
}

export interface IAdapterEventPublisher {
  publishRegistered(descriptor: ProviderAdapterDescriptor): Promise<void>;
  publishLifecycle(
    adapterId: ProviderAdapterId,
    state: string
  ): Promise<void>;
}
