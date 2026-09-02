/**
 * Provider adapter contracts.
 *
 * Purpose: Abstract execution adapter ports — no vendor SDKs.
 * Responsibilities: Define IProviderAdapter and request/response shapes.
 * Usage: ProviderFactory returns adapters; concrete adapters in future milestones.
 * Future Extension: Streaming and tool-call adapters.
 */

import type { ProviderId } from "../../core/identifiers";
import type { Result } from "../../core/result";
import type { ProviderAuthenticationContract } from "../authentication/provider-authentication";
import type { ProviderDefinition } from "../metadata/provider-definition";

/**
 * Provider-agnostic execute request.
 * No vendor-specific fields.
 */
export interface ProviderAdapterRequest {
  readonly capabilityId: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly options?: Readonly<Record<string, unknown>>;
}

export interface ProviderAdapterResponse {
  readonly output: Readonly<Record<string, unknown>>;
  readonly usage?: Readonly<Record<string, unknown>>;
  readonly providerRequestId?: string;
}

/**
 * Abstract provider adapter.
 * Concrete OpenAI/Claude/Gemini adapters are intentionally not implemented.
 */
export interface IProviderAdapter {
  readonly providerId: ProviderId;
  readonly definition: ProviderDefinition;

  /**
   * Execute is reserved for future milestones.
   * M1.3 adapters must not perform AI execution.
   */
  execute(
    request: ProviderAdapterRequest
  ): Promise<Result<ProviderAdapterResponse>>;
}

/**
 * Adapter construction context (interfaces only).
 */
export interface ProviderAdapterContext {
  readonly definition: ProviderDefinition;
  readonly authentication?: ProviderAuthenticationContract;
}

/**
 * Abstract base for future adapters — no SDK logic.
 */
export abstract class AbstractProviderAdapter implements IProviderAdapter {
  readonly providerId: ProviderId;
  readonly definition: ProviderDefinition;

  protected constructor(protected readonly context: ProviderAdapterContext) {
    this.providerId = context.definition.id;
    this.definition = context.definition;
  }

  abstract execute(
    request: ProviderAdapterRequest
  ): Promise<Result<ProviderAdapterResponse>>;
}
