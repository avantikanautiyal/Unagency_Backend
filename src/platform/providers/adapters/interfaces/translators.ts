/**
 * Translator ports.
 *
 * Purpose: Transform between platform contracts and canonical shapes.
 * Responsibilities: request/response/error translation.
 * Usage: Injected into the adapter engine.
 * Future Extension: Streaming request translation.
 *
 * Translators NEVER expose provider-specific objects on public contracts.
 */

import type { Result } from "../../../core/result";
import type { ProviderExecutionResponse } from "../../runtime/contracts/provider-execution-response";
import type { ProviderAdapterDescriptor } from "../contracts/adapter-descriptor";
import type { ProviderAdapterRequest } from "../contracts/adapter-io";
import type { ProviderAdapterResponse } from "../contracts/adapter-io";
import type { ProviderError } from "../contracts/diagnostics";
import type { ProviderTranslationResult } from "../contracts/results";
import type { PrepareAdapterExecutionInput } from "./inputs";

export interface IRequestTranslator {
  /** NegotiatedExecution (+ canonical input) → ProviderAdapterRequest. */
  toAdapterRequest(
    input: PrepareAdapterExecutionInput,
    descriptor: ProviderAdapterDescriptor
  ): Result<ProviderTranslationResult<ProviderAdapterRequest>>;
}

export interface IResponseTranslator {
  /** Canonical ProviderAdapterResponse → runtime ProviderExecutionResponse. */
  toExecutionResponse(
    response: ProviderAdapterResponse
  ): Result<ProviderTranslationResult<ProviderExecutionResponse>>;
}

export interface IErrorTranslator {
  /** Any raw error → canonical ProviderError. */
  toProviderError(
    error: unknown,
    context?: Readonly<Record<string, unknown>>
  ): ProviderError;
}
