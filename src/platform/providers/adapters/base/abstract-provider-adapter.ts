/**
 * Abstract provider adapter base class.
 *
 * Purpose: Reusable base implementing the provider-independent adapter behavior.
 * Responsibilities: describe, validate, normalize, translateError, health.
 *   Leaves translateRequest abstract for concrete providers (M4.5).
 * Usage: Concrete/specialized adapters extend this.
 * Future Extension: Batch + tool-call round trips.
 *
 * NO networking, NO vendor SDK. translateRequest returns an opaque wire payload.
 */

import { success, type Result } from "../../../core/result";
import type { ProviderAdapterDescriptor } from "../contracts/adapter-descriptor";
import type { ProviderAdapterMetadata } from "../contracts/adapter-descriptor";
import type {
  ProviderAdapterRequest,
  ProviderWirePayload,
} from "../contracts/adapter-io";
import type { ProviderError } from "../contracts/diagnostics";
import type { AdapterCategory } from "../contracts/enums";
import type { ProviderHealthSummary } from "../contracts/lifecycle-streaming";
import type { ProviderManifest } from "../contracts/provider-manifest";
import type {
  ProviderNormalizationResult,
  ProviderTranslationResult,
  ProviderValidationResult,
} from "../contracts/results";
import { deriveCompatibilityProfile } from "../manifests/manifest-projection";
import type { IProviderAdapter } from "../interfaces/adapter";
import type { IErrorTranslator } from "../interfaces/translators";
import type {
  IAdapterValidator,
  IResponseNormalizer,
} from "../interfaces/validation";
import { DefaultResponseNormalizer } from "../normalization/default-response-normalizer";
import { DefaultAdapterValidator } from "../validation/default-adapter-validator";
import { DefaultErrorTranslator } from "../translators/default-error-translator";

export interface AbstractAdapterDeps {
  readonly normalizer?: IResponseNormalizer;
  readonly validator?: IAdapterValidator;
  readonly errorTranslator?: IErrorTranslator;
  readonly nowIso?: () => string;
}

const HEALTHY_STATES = new Set(["registered", "ready", "degraded"]);

export abstract class AbstractProviderAdapter implements IProviderAdapter {
  abstract readonly category: AdapterCategory;

  protected readonly normalizer: IResponseNormalizer;
  protected readonly validator: IAdapterValidator;
  protected readonly errorTranslator: IErrorTranslator;
  protected readonly nowIso: () => string;

  protected constructor(
    protected readonly metadata: ProviderAdapterMetadata,
    protected readonly manifest: ProviderManifest,
    deps: AbstractAdapterDeps = {}
  ) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.normalizer = deps.normalizer ?? new DefaultResponseNormalizer(this.nowIso);
    this.validator = deps.validator ?? new DefaultAdapterValidator();
    this.errorTranslator = deps.errorTranslator ?? new DefaultErrorTranslator();
  }

  describe(): ProviderAdapterDescriptor {
    const profile = deriveCompatibilityProfile(this.manifest);
    return {
      metadata: this.metadata,
      manifest: this.manifest,
      lifecycleState: this.manifest.status,
      supportedModalities: this.manifest.modalities,
      supportedFeatures: profile.features,
    };
  }

  validate(request: ProviderAdapterRequest): Result<ProviderValidationResult> {
    return this.validator.validateModelCompatibility(this.manifest, {
      modelId: request.modelId,
      features: request.features,
      streaming: request.streaming,
    });
  }

  /** Provider-specific mapping — implemented by concrete adapters (M4.5). */
  abstract translateRequest(
    request: ProviderAdapterRequest
  ): Result<ProviderTranslationResult<ProviderWirePayload>>;

  normalizeResponse(
    raw: ProviderWirePayload,
    request: ProviderAdapterRequest
  ): Result<ProviderNormalizationResult> {
    return this.normalizer.normalize(raw, request);
  }

  translateError(error: unknown, request?: ProviderAdapterRequest): ProviderError {
    return this.errorTranslator.toProviderError(error, {
      adapterId: this.metadata.adapterId,
      requestId: request?.requestId,
    });
  }

  health(): Result<ProviderHealthSummary> {
    return success({
      adapterId: this.metadata.adapterId,
      providerId: this.metadata.providerId,
      state: this.manifest.status,
      healthy: HEALTHY_STATES.has(this.manifest.status),
      checkedAt: this.nowIso(),
    });
  }
}
