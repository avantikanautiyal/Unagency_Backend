/**
 * Model capability derivation.
 *
 * Purpose: Map a ProviderCapabilityProfile (matrix) to model-level capabilities.
 * Responsibilities: Bridge the 9 matrix feature flags + attributes to the
 *   richer model compatibility surface (reasoning/structured/json/tools).
 * Usage: Used by the model negotiator.
 * Future Extension: Per-model overrides when a model registry exists.
 */

import type { ProviderId } from "../../../core/identifiers";
import type { ProviderCapabilityProfile } from "../../capability-matrix/contracts/provider-capabilities";
import type { ModelCompatibility } from "../contracts/compatibility";

function attrBool(
  attributes: Readonly<Record<string, unknown>> | undefined,
  key: string,
  fallback: boolean
): boolean {
  const value = attributes?.[key];
  return typeof value === "boolean" ? value : fallback;
}

export function deriveModelCompatibility(
  providerId: ProviderId,
  modelId: string | undefined,
  profile: ProviderCapabilityProfile | undefined,
  reasons: string[]
): ModelCompatibility {
  if (!profile) {
    reasons.push("no capability profile registered for provider");
    return {
      providerId,
      modelId,
      available: false,
      supportsStreaming: false,
      supportsReasoning: false,
      supportsVision: false,
      supportsAudio: false,
      supportsEmbeddings: false,
      supportsStructuredOutput: false,
      supportsFunctionCalling: false,
      supportsJsonMode: false,
      supportsToolUse: false,
      reasons,
    };
  }

  const f = profile.features;
  const attrs = profile.attributes;

  return {
    providerId,
    modelId,
    available: true,
    contextWindow: profile.maxContextTokens,
    supportsStreaming: f.supportsStreaming,
    supportsVision: f.supportsVision,
    supportsAudio: f.supportsAudio,
    supportsEmbeddings: f.supportsEmbeddings,
    supportsFunctionCalling: f.supportsFunctionCalling,
    // Not represented as first-class matrix flags — derived from attributes,
    // falling back to function-calling support where sensible.
    supportsReasoning: attrBool(attrs, "supportsReasoning", false),
    supportsStructuredOutput: attrBool(
      attrs,
      "supportsStructuredOutput",
      f.supportsFunctionCalling
    ),
    supportsJsonMode: attrBool(attrs, "supportsJsonMode", false),
    supportsToolUse: attrBool(attrs, "supportsToolUse", f.supportsFunctionCalling),
    reasons,
  };
}
