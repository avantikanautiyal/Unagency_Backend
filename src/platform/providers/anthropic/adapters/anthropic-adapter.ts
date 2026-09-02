/**
 * Anthropic text provider adapter.
 */

import { failure, success, type Result } from "../../../core/result";
import { ValidationError } from "../../../core/errors";
import { asProviderId } from "../../../core/identifiers";
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
  ANTHROPIC_WIRE_MODEL_MAP,
} from "../constants";
import {
  canonicalToWireModelId,
  mapCanonicalToAnthropicRequest,
} from "../requests/request-mapper";
import { isVisionCapability } from "../../common/resolve-execution-modality";

function resolveAnthropicWireModel(canonicalOrWire: string): string {
  const canonical = canonicalToWireModelId(canonicalOrWire);
  // Map both inventory aliases and raw/dated wire ids to a live Anthropic model.
  return (
    ANTHROPIC_WIRE_MODEL_MAP[canonical] ??
    ANTHROPIC_WIRE_MODEL_MAP[canonicalOrWire] ??
    canonical
  );
}

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
    const knownInventory =
      (ANTHROPIC_SEED_MODELS as readonly string[]).includes(wireModelId) ||
      Object.prototype.hasOwnProperty.call(ANTHROPIC_WIRE_MODEL_MAP, wireModelId);
    if (!knownInventory) {
      return failure(
        new ValidationError(
          `Model '${requestedModelId}' (wire '${wireModelId}') is not available for Anthropic`
        )
      );
    }

    const inventoryForVision =
      (ANTHROPIC_SEED_MODELS as readonly string[]).includes(wireModelId)
        ? wireModelId
        : "claude-sonnet-4-5";
    if (
      isVisionCapability(String(request.capabilityId)) &&
      !ANTHROPIC_VISION_MODELS.includes(
        inventoryForVision as (typeof ANTHROPIC_VISION_MODELS)[number]
      )
    ) {
      return failure(
        new ValidationError(`Model '${requestedModelId}' does not support vision.analyze`)
      );
    }

    const apiModelId = resolveAnthropicWireModel(wireModelId);
    const wire = mapCanonicalToAnthropicRequest(request, apiModelId);
    return success({
      value: { ...wire, resolvedModelId: wireModelId },
      warnings: [],
      droppedFields: [],
    });
  }

  validate(request: ProviderAdapterRequest): Result<ProviderValidationResult> {
    const wireModelId = canonicalToWireModelId(request.modelId);
    const knownInventory =
      (ANTHROPIC_SEED_MODELS as readonly string[]).includes(wireModelId) ||
      Object.prototype.hasOwnProperty.call(ANTHROPIC_WIRE_MODEL_MAP, wireModelId);
    if (!knownInventory) {
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
