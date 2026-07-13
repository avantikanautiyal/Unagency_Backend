/**
 * Provider adapter port.
 *
 * Purpose: The contract every provider adapter honors.
 * Responsibilities: validate, translate request, normalize response,
 *   translate error, health, describe. No networking, no vendor SDK.
 * Usage: Implemented by AbstractProviderAdapter subclasses; owned by registry.
 * Future Extension: Batch requests, tool-call round trips.
 */

import type { Result } from "../../../shared/result";
import type { ProviderAdapterDescriptor } from "../contracts/adapter-descriptor";
import type {
  ProviderAdapterRequest,
  ProviderWirePayload,
} from "../contracts/adapter-io";
import type { ProviderError } from "../contracts/diagnostics";
import type { ProviderHealthSummary } from "../contracts/lifecycle-streaming";
import type {
  ProviderNormalizationResult,
  ProviderTranslationResult,
  ProviderValidationResult,
} from "../contracts/results";

export interface IProviderAdapter {
  describe(): ProviderAdapterDescriptor;
  validate(request: ProviderAdapterRequest): Result<ProviderValidationResult>;
  translateRequest(
    request: ProviderAdapterRequest
  ): Result<ProviderTranslationResult<ProviderWirePayload>>;
  normalizeResponse(
    raw: ProviderWirePayload,
    request: ProviderAdapterRequest
  ): Result<ProviderNormalizationResult>;
  translateError(error: unknown, request?: ProviderAdapterRequest): ProviderError;
  health(): Result<ProviderHealthSummary>;
}
