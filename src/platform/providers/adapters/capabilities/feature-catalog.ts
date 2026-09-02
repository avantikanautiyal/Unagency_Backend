/**
 * Canonical feature catalog.
 *
 * Purpose: Single vocabulary of canonical feature names across the platform.
 * Responsibilities: Define feature name constants + capability→feature mapping.
 * Usage: Shared by validators, translators, diagnostics.
 * Future Extension: New canonical features (additive).
 *
 * Names intentionally match the negotiation platform's NegotiableFeature so
 * negotiated features flow through unchanged.
 */

import type { ProviderModelCapability } from "../contracts/provider-model";

export const CANONICAL_FEATURES = {
  streaming: "streaming",
  functions: "functions",
  vision: "vision",
  images: "images",
  audio: "audio",
  reasoning: "reasoning",
  tools: "tools",
  embeddings: "embeddings",
  jsonMode: "json_mode",
  responseFormat: "response_format",
  safety: "safety",
} as const;

export type CanonicalFeature =
  (typeof CANONICAL_FEATURES)[keyof typeof CANONICAL_FEATURES];

/** Legacy / vendor aliases that must not reach adapter validation. */
const LEGACY_FEATURE_ALIASES: Readonly<Record<string, CanonicalFeature | null>> =
  {
    tool_calling: null,
    structured_outputs: CANONICAL_FEATURES.responseFormat,
    function_calling: CANONICAL_FEATURES.functions,
    tool_use: CANONICAL_FEATURES.tools,
  };

/**
 * Normalize execution feature flags to the canonical catalog.
 * Drops non-canonical legacy names (e.g. tool_calling) that adapters reject.
 */
export function sanitizeExecutionFeatures(
  features: readonly string[]
): string[] {
  const set = new Set<string>();
  for (const raw of features) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const key = raw.trim().toLowerCase();
    const mapped = LEGACY_FEATURE_ALIASES[key];
    if (mapped === null) continue;
    if (mapped) {
      set.add(mapped);
      continue;
    }
    set.add(key);
  }
  return [...set];
}

/**
 * Derive the canonical feature list a model capability supports.
 */
export function capabilityFeatures(
  capability: ProviderModelCapability
): readonly string[] {
  const features: string[] = [];
  if (capability.streaming) features.push(CANONICAL_FEATURES.streaming);
  if (capability.toolCalling) {
    features.push(CANONICAL_FEATURES.functions, CANONICAL_FEATURES.tools);
  }
  if (capability.vision) {
    features.push(CANONICAL_FEATURES.vision, CANONICAL_FEATURES.images);
  }
  if (capability.audio) features.push(CANONICAL_FEATURES.audio);
  if (capability.embeddings) features.push(CANONICAL_FEATURES.embeddings);
  if (capability.reasoning) features.push(CANONICAL_FEATURES.reasoning);
  if (capability.jsonMode) features.push(CANONICAL_FEATURES.jsonMode);
  if (capability.structuredOutputs) {
    features.push(CANONICAL_FEATURES.responseFormat);
  }
  return [...new Set(features)];
}
