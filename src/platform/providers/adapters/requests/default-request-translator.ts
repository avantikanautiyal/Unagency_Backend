/**
 * Default request translator.
 *
 * Purpose: NegotiatedExecution (+ canonical input) → ProviderAdapterRequest.
 * Responsibilities: Resolve model/modality/features; produce a canonical request.
 * Usage: Injected into the adapter engine.
 * Future Extension: Modality-specific input shaping.
 *
 * Produces only canonical shapes — no vendor object.
 */

import { success, type Result } from "../../../core/result";
import type { ProviderAdapterDescriptor } from "../contracts/adapter-descriptor";
import type { ProviderAdapterRequest } from "../contracts/adapter-io";
import type { ProviderDiagnostic } from "../contracts/diagnostics";
import type { ProviderModality } from "../contracts/enums";
import type { ProviderTranslationResult } from "../contracts/results";
import type { PrepareAdapterExecutionInput } from "../interfaces/inputs";
import type { IRequestTranslator } from "../interfaces/translators";
import { findModel } from "../models/model-helpers";
import { resolveDefaultModelId } from "../manifests/manifest-projection";

export class DefaultRequestTranslator implements IRequestTranslator {
  constructor(
    private readonly nowIso: () => string = () => new Date().toISOString(),
    private readonly createId: (prefix: string) => string = (p) =>
      `${p}_${Math.random().toString(36).slice(2)}`
  ) {}

  toAdapterRequest(
    input: PrepareAdapterExecutionInput,
    descriptor: ProviderAdapterDescriptor
  ): Result<ProviderTranslationResult<ProviderAdapterRequest>> {
    const { negotiated } = input;
    const manifest = descriptor.manifest;
    const warnings: ProviderDiagnostic[] = [];
    const droppedFields: string[] = [];

    const modality: ProviderModality =
      input.modality ?? manifest.modalities[0] ?? "text";

    const modelId =
      negotiated.selectedModelId ??
      resolveDefaultModelId(manifest, modality) ??
      "default";

    if (!findModel(manifest, modelId)) {
      warnings.push({
        code: "model_not_in_manifest",
        message: `model '${modelId}' is not declared in the manifest`,
        severity: "warning",
        source: "request-translator",
      });
    }

    const request: ProviderAdapterRequest = {
      requestId: input.requestId ?? this.createId("areq"),
      providerId: descriptor.metadata.providerId,
      adapterId: descriptor.metadata.adapterId,
      modelId,
      capabilityId: negotiated.capabilityId,
      modality,
      input: Object.freeze({ ...input.input }),
      parameters: Object.freeze({ ...(input.parameters ?? {}) }),
      features: negotiated.negotiatedFeatures,
      streaming: negotiated.executionProfile.streaming,
      timeoutMs:
        input.timeoutMs ??
        negotiated.executionProfile.timeoutPolicy.executionTimeoutMs,
      metadata: Object.freeze({
        negotiationId: negotiated.negotiationId,
        ...(input.metadata ?? {}),
      }),
      createdAt: this.nowIso(),
    };

    return success({ value: request, warnings, droppedFields });
  }
}
