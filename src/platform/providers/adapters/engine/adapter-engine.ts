/**
 * Provider adapter engine (platform facade).
 *
 * Purpose: Orchestrate the translation pipeline around an adapter.
 * Responsibilities: prepare (resolve → validate → translate request), finalize
 *   (normalize → translate to runtime response), translate errors, describe.
 * Usage: Consumed by the (future) runtime dispatch layer.
 * Future Extension: Streaming prepare/finalize. NO networking here.
 *
 * PIPELINE: NegotiatedExecution → ProviderAdapterRequest → (wire) → [dispatch]
 *           → ProviderAdapterResponse → ProviderExecutionResponse.
 */

import { failure, success, type Result } from "../../../core/result";
import type { ProviderExecutionResponse } from "../../runtime/contracts/provider-execution-response";
import type { ProviderAdapterDescriptor } from "../contracts/adapter-descriptor";
import type { ProviderAdapterRequest } from "../contracts/adapter-io";
import type { ProviderDiagnostic, ProviderError } from "../contracts/diagnostics";
import type { ProviderAdapterId } from "../contracts/identifiers";
import { AdapterError } from "../errors/adapter-errors";
import type { IProviderAdapterRegistry } from "../interfaces/engine-registry";
import type {
  IProviderAdapterEngine,
  PreparedAdapterExecution,
} from "../interfaces/engine-registry";
import type {
  NormalizeAdapterResponseInput,
  PrepareAdapterExecutionInput,
} from "../interfaces/inputs";
import type {
  IRequestTranslator,
  IResponseTranslator,
} from "../interfaces/translators";

export interface AdapterEngineDeps {
  readonly registry: IProviderAdapterRegistry;
  readonly requestTranslator: IRequestTranslator;
  readonly responseTranslator: IResponseTranslator;
}

export class ProviderAdapterEngine implements IProviderAdapterEngine {
  constructor(private readonly deps: AdapterEngineDeps) {}

  prepare(
    input: PrepareAdapterExecutionInput
  ): Result<PreparedAdapterExecution> {
    const providerId = input.negotiated.selectedProviderId;
    const adapterResult = this.deps.registry.resolveByProvider(providerId);
    if (!adapterResult.ok) {
      return adapterResult;
    }
    const adapter = adapterResult.value;
    const descriptor = adapter.describe();

    const warnings: ProviderDiagnostic[] = [];

    const translated = this.deps.requestTranslator.toAdapterRequest(
      input,
      descriptor
    );
    if (!translated.ok) {
      return translated;
    }
    warnings.push(...translated.value.warnings);
    const adapterRequest = translated.value.value;

    const validation = adapter.validate(adapterRequest);
    if (!validation.ok) {
      return validation;
    }
    if (!validation.value.valid) {
      return failure(
        new AdapterError("adapter request failed validation", {
          adapterId: descriptor.metadata.adapterId,
          issues: validation.value.issues,
        })
      );
    }

    const wire = adapter.translateRequest(adapterRequest);
    if (!wire.ok) {
      return wire;
    }
    warnings.push(...wire.value.warnings);

    return success({
      adapterRequest,
      wirePayload: wire.value.value,
      warnings,
    });
  }

  finalize(
    input: NormalizeAdapterResponseInput
  ): Result<ProviderExecutionResponse> {
    const adapterResult = this.deps.registry.resolve(input.adapterId);
    if (!adapterResult.ok) {
      return adapterResult;
    }
    const adapter = adapterResult.value;

    // Enrich the opaque payload with a measured latency hint (if provided).
    const raw =
      input.latencyMs !== undefined && (input.raw as Record<string, unknown>).latencyMs === undefined
        ? { ...input.raw, latencyMs: input.latencyMs }
        : input.raw;

    const normalized = adapter.normalizeResponse(raw, input.request);
    if (!normalized.ok) {
      return normalized;
    }

    const translated = this.deps.responseTranslator.toExecutionResponse(
      normalized.value.response
    );
    if (!translated.ok) {
      return translated;
    }

    return success(translated.value.value);
  }

  translateError(
    adapterId: ProviderAdapterId,
    error: unknown,
    request?: ProviderAdapterRequest
  ): ProviderError {
    const adapterResult = this.deps.registry.resolve(adapterId);
    if (adapterResult.ok) {
      return adapterResult.value.translateError(error, request);
    }
    // Fall back to a generic canonicalization when the adapter is unknown.
    return {
      kind: "unknown",
      code: "adapter_not_found",
      message: error instanceof Error ? error.message : String(error),
      retryable: false,
      details: { adapterId },
    };
  }

  describe(adapterId: ProviderAdapterId): Result<ProviderAdapterDescriptor> {
    return this.deps.registry.describe(adapterId);
  }
}
