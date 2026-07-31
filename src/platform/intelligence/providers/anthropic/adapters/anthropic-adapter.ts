/**
 * Anthropic text provider adapter.
 */

import { failure, success, type Result } from "../../../shared/result";
import { ValidationError } from "../../../shared/errors";
import { asProviderId } from "../../../shared/identifiers";
import { AbstractTextProviderAdapter } from "../../adapters/base/specialized-adapters";
import type { AbstractAdapterDeps } from "../../adapters/base/abstract-provider-adapter";
import type { ProviderAdapterMetadata } from "../../adapters/contracts/adapter-descriptor";
import type {
  ProviderAdapterRequest,
  ProviderWirePayload,
} from "../../adapters/contracts/adapter-io";
import type { ProviderManifest } from "../../adapters/contracts/provider-manifest";
import type {
  ProviderTranslationResult,
  ProviderValidationResult,
} from "../../adapters/contracts/results";
import { asProviderAdapterId } from "../../adapters/contracts/identifiers";
import {
  ANTHROPIC_ADAPTER_ID,
  ANTHROPIC_PROVIDER_ID,
  ANTHROPIC_PROVIDER_VERSION,
  ANTHROPIC_VENDOR,
  ANTHROPIC_SEED_MODELS,
  ANTHROPIC_VISION_MODELS,
} from "../constants";
import {
  canonicalToWireModelId,
  mapCanonicalToAnthropicRequest,
} from "../requests/request-mapper";
import { isVisionCapability } from "../../common/resolve-execution-modality";

export class AnthropicProviderAdapter extends AbstractTextProviderAdapter {
  constructor(manifest: ProviderManifest, deps: AbstractAdapterDeps = {}) {
    const metadata: ProviderAdapterMetadata = {
      adapterId: asProviderAdapterId(ANTHROPIC_ADAPTER_ID),
      providerId: asProviderId(ANTHROPIC_PROVIDER_ID),
      vendor: ANTHROPIC_VENDOR,
      category: "text",
      version: ANTHROPIC_PROVIDER_VERSION,
      description: "Anthropic Messages API text provider adapter",
      tags: ["anthropic", "text", "reasoning"],
    };
    super(metadata, manifest, deps);
  }

  translateRequest(
    request: ProviderAdapterRequest
  ): Result<ProviderTranslationResult<ProviderWirePayload>> {
    const requestedModelId = request.modelId?.trim();
    if (!requestedModelId) {
      return failure(new ValidationError("modelId is required"));
    }

    const wireModelId = canonicalToWireModelId(requestedModelId);
    if (!ANTHROPIC_SEED_MODELS.includes(wireModelId as (typeof ANTHROPIC_SEED_MODELS)[number])) {
      return failure(
        new ValidationError(
          `Model '${requestedModelId}' (wire '${wireModelId}') is not available for Anthropic`
        )
      );
    }

    if (
      isVisionCapability(String(request.capabilityId)) &&
      !ANTHROPIC_VISION_MODELS.includes(wireModelId as (typeof ANTHROPIC_VISION_MODELS)[number])
    ) {
      return failure(
        new ValidationError(`Model '${requestedModelId}' does not support vision.analyze`)
      );
    }

    const wire = mapCanonicalToAnthropicRequest(request, wireModelId);
    return success({
      value: { ...wire, resolvedModelId: wireModelId },
      warnings: [],
      droppedFields: [],
    });
  }

  validate(request: ProviderAdapterRequest): Result<ProviderValidationResult> {
    const wireModelId = canonicalToWireModelId(request.modelId);
    if (!ANTHROPIC_SEED_MODELS.includes(wireModelId as (typeof ANTHROPIC_SEED_MODELS)[number])) {
      return success({
        valid: false,
        issues: [
          {
            code: "model_not_found",
            message: `Model '${request.modelId}' is not registered for Anthropic`,
            severity: "error",
          },
        ],
      });
    }
    return super.validate({ ...request, modelId: wireModelId });
  }
}
