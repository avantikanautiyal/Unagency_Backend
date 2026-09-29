/**
 * OpenAI-compatible text provider adapter — canonical request translation.
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
import { mapCanonicalToOpenAIRequest } from "../../openai/requests/request-mapper";
import type { TextProviderConfig } from "../contracts/text-provider-config";
import { isEmbeddingCapability, isVisionCapability } from "../../common/resolve-execution-modality";
import { mapToOpenAIVisionContentParts } from "../../common/vision-content";
import { extractEmbeddingInputText } from "../../common/embedding-output";
import { buildStructuredSchemaDowngradeDiagnostic } from "../../tools/structured/canonical-structured-contract-envelope";

/** Wire models supporting vision.analyze per compat vendor (from inventory seed). */
const COMPAT_VISION_MODELS: Partial<Record<TextProviderConfig["vendor"], readonly string[]>> = {
  xai: ["grok-2"],
};

const COMPAT_EMBEDDING_MODELS: Partial<Record<TextProviderConfig["vendor"], readonly string[]>> = {
  mistral: ["mistral-embed"],
};

export class CompatTextAdapter extends AbstractTextProviderAdapter {
  private readonly config: TextProviderConfig;
  private readonly knownWireModels: readonly string[];

  constructor(
    config: TextProviderConfig,
    manifest: ProviderManifest,
    knownWireModels: readonly string[],
    deps: AbstractAdapterDeps = {}
  ) {
    const metadata: ProviderAdapterMetadata = {
      adapterId: asProviderAdapterId(config.adapterId),
      providerId: asProviderId(config.canonicalProviderId),
      vendor: config.vendor,
      category: "text",
      version: config.version,
      description: `${config.vendor} OpenAI-compatible text provider adapter`,
      tags: [config.vendor, "compat", "text"],
    };
    super(metadata, manifest, deps);
    this.config = config;
    this.knownWireModels = knownWireModels;
  }

  translateRequest(
    request: ProviderAdapterRequest
  ): Result<ProviderTranslationResult<ProviderWirePayload>> {
    const requestedModelId = request.modelId?.trim();
    if (!requestedModelId) {
      return failure(new ValidationError("modelId is required"));
    }

    const wireModelId = canonicalToWireModelId(requestedModelId, this.config.vendor);
    if (!this.knownWireModels.includes(wireModelId)) {
      return failure(
        new ValidationError(
          `Model '${requestedModelId}' (wire '${wireModelId}') is not available for ${this.config.vendor}`
        )
      );
    }

    if (isVisionCapability(String(request.capabilityId))) {
      const visionModels = COMPAT_VISION_MODELS[this.config.vendor];
      if (!visionModels?.includes(wireModelId)) {
        return failure(
          new ValidationError(`Model '${requestedModelId}' does not support vision.analyze`)
        );
      }
      const parts = mapToOpenAIVisionContentParts(request);
      const wire: ProviderWirePayload = Object.freeze({
        operation: "chat.completions",
        path: "/chat/completions",
        body: Object.freeze({
          model: wireModelId,
          messages: [{ role: "user", content: parts }],
        }),
      });
      return success({
        value: { ...wire, resolvedModelId: wireModelId },
        warnings: [],
        droppedFields: [],
      });
    }

    if (isEmbeddingCapability(String(request.capabilityId)) || request.modality === "embedding") {
      const embedModels = COMPAT_EMBEDDING_MODELS[this.config.vendor];
      if (!embedModels?.includes(wireModelId)) {
        return failure(
          new ValidationError(`Model '${requestedModelId}' does not support embedding.generate`)
        );
      }
      const text = extractEmbeddingInputText(request.input);
      if (!text.ok) return text;
    }

    const wire = mapCanonicalToOpenAIRequest(request, wireModelId);
    const body = { ...(wire.body as Record<string, unknown>) };
    const warnings: Array<{
      code: string;
      message: string;
      severity: "warning";
      source?: string;
      data?: Record<string, unknown>;
    }> = [];
    const droppedFields: string[] = [];
    // Groq/Mistral/xAI often reject OpenAI json_schema; keep json_object and
    // rely on prompt guidance + canonical validation in Integration OS.
    const rf = body.response_format;
    if (
      rf &&
      typeof rf === "object" &&
      (rf as { type?: string }).type === "json_schema"
    ) {
      const schemaName =
        typeof (rf as { json_schema?: { name?: unknown } }).json_schema?.name ===
        "string"
          ? String((rf as { json_schema: { name: string } }).json_schema.name)
          : undefined;
      body.response_format = { type: "json_object" };
      warnings.push(
        buildStructuredSchemaDowngradeDiagnostic({
          vendor: this.config.vendor,
          schemaName,
          from: "json_schema",
          to: "json_object",
          nativeEnforcement: "prompt_and_validation_only",
        }),
      );
      droppedFields.push("response_format.json_schema");
    }
    return success({
      value: {
        ...wire,
        body: Object.freeze(body),
        resolvedModelId: wireModelId,
      },
      warnings,
      droppedFields,
    });
  }

  validate(request: ProviderAdapterRequest): Result<ProviderValidationResult> {
    const wireModelId = canonicalToWireModelId(request.modelId, this.config.vendor);
    if (!this.knownWireModels.includes(wireModelId)) {
      return success({
        valid: false,
        issues: [
          {
            code: "model_not_found",
            message: `Model '${request.modelId}' is not registered for ${this.config.vendor}`,
            severity: "error",
          },
        ],
      });
    }
    if (isEmbeddingCapability(String(request.capabilityId)) || request.modality === "embedding") {
      const embedModels = COMPAT_EMBEDDING_MODELS[this.config.vendor];
      if (!embedModels?.includes(wireModelId)) {
        return success({
          valid: false,
          issues: [
            {
              code: "model_capability_mismatch",
              message: `Model '${request.modelId}' does not support embedding.generate`,
              severity: "error",
            },
          ],
        });
      }
      const text = extractEmbeddingInputText(request.input);
      if (!text.ok) {
        return success({
          valid: false,
          issues: [
            {
              code: "invalid_request",
              message: text.error.message,
              severity: "error",
            },
          ],
        });
      }
    }
    return super.validate({ ...request, modelId: wireModelId });
  }
}

export function canonicalToWireModelId(modelId: string, vendor: string): string {
  if (modelId.includes("/")) {
    const [prefix, ...rest] = modelId.split("/");
    if (prefix === vendor) return rest.join("/");
    return rest.join("/");
  }
  return modelId;
}
