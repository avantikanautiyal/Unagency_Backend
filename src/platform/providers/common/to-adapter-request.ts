/**
 * Map ProviderExecutionRequest → ProviderAdapterRequest with correct modality.
 */

import { asProviderId } from "../../core/identifiers";
import type { ProviderExecutionRequest } from "../runtime/contracts/provider-execution-request";
import type { ProviderAdapterRequest } from "../adapters/contracts/adapter-io";
import { asProviderAdapterId } from "../adapters/contracts/identifiers";
import {
  resolveExecutionFeatures,
  resolveExecutionModality,
} from "./resolve-execution-modality";
import { sanitizeExecutionFeatures } from "../adapters/capabilities/feature-catalog";

export function toAdapterRequestFromExecution(input: {
  request: ProviderExecutionRequest;
  canonicalProviderId: string;
  adapterId: string;
  nowIso: string;
}): ProviderAdapterRequest {
  const cap = String(input.request.capabilityId);
  const optionFeatures = extractOptionFeatures(input.request.options);
  const features = sanitizeExecutionFeatures(
    uniqueFeatures([...resolveExecutionFeatures(cap), ...optionFeatures])
  );
  return {
    requestId: input.request.requestId,
    providerId: asProviderId(input.canonicalProviderId),
    adapterId: asProviderAdapterId(input.adapterId),
    modelId: input.request.modelId ?? "",
    capabilityId: input.request.capabilityId,
    modality: resolveExecutionModality(cap),
    input: input.request.payload,
    parameters: (input.request.options as Record<string, unknown>) ?? {},
    features,
    streaming: input.request.streaming,
    timeoutMs: input.request.timeoutPolicy.executionTimeoutMs ?? 120_000,
    metadata: input.request.metadata ?? {},
    createdAt: input.nowIso,
  };
}

function extractOptionFeatures(options: unknown): readonly string[] {
  if (!options || typeof options !== "object") return [];
  const features = (options as Record<string, unknown>).features;
  if (!Array.isArray(features)) return [];
  return features.filter((f): f is string => typeof f === "string");
}

function uniqueFeatures(features: readonly string[]): string[] {
  return [...new Set(features)];
}
