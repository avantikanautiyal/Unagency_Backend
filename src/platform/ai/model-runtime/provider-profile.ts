/**
 * Phase 12 — Provider family profile for CMR representation (not a second registry).
 * Derived from known providerId patterns used by existing adapters.
 */

export type CmrProviderFamily =
  | "openai"
  | "anthropic"
  | "openai_compatible"
  | "gemini"
  | "cohere"
  | "unknown";

export type CmrProviderRepresentationProfile = {
  readonly family: CmrProviderFamily;
  /** Native image parts via Phase 9A handoff (OpenAI/Anthropic/compat). */
  readonly nativeCanonicalImageHandoff: boolean;
  /** Labeled-prompt flatten for text transports. */
  readonly compatibilityFlatten: boolean;
  /** response_format / tool_use style structured output already in adapters. */
  readonly structuredOutputFormatting: boolean;
};

/**
 * Resolve a thin CMR representation profile from an existing providerId.
 * Does not select providers or invent capabilities beyond current wiring.
 */
export function resolveCmrProviderRepresentationProfile(
  providerId?: string,
): CmrProviderRepresentationProfile {
  const id = String(providerId ?? "").toLowerCase();

  if (id.includes("anthropic") || id.includes("claude")) {
    return {
      family: "anthropic",
      nativeCanonicalImageHandoff: true,
      compatibilityFlatten: true,
      structuredOutputFormatting: true,
    };
  }
  if (id.includes("gemini") || id.includes("google")) {
    return {
      family: "gemini",
      // Phase 9A CMR multimodal handoff is not wired for Gemini — do not claim it.
      nativeCanonicalImageHandoff: false,
      compatibilityFlatten: true,
      structuredOutputFormatting: false,
    };
  }
  if (id.includes("cohere")) {
    return {
      family: "cohere",
      nativeCanonicalImageHandoff: false,
      compatibilityFlatten: true,
      structuredOutputFormatting: false,
    };
  }
  if (
    id.includes("openai") ||
    id.includes("gpt") ||
    id.includes("compat") ||
    id.includes("mistral") ||
    id.includes("groq") ||
    id.includes("xai") ||
    id.includes("deepseek") ||
    id.includes("together") ||
    id.includes("fireworks") ||
    id.includes("openrouter")
  ) {
    const openaiNative = id.includes("openai") || id.includes("gpt");
    return {
      family: openaiNative ? "openai" : "openai_compatible",
      nativeCanonicalImageHandoff: true,
      compatibilityFlatten: true,
      structuredOutputFormatting: true,
    };
  }

  // Before provider selection, do not block on multimodal handoff —
  // selection may still choose OpenAI/Anthropic/compat.
  if (!providerId?.trim()) {
    return {
      family: "unknown",
      nativeCanonicalImageHandoff: true,
      compatibilityFlatten: true,
      structuredOutputFormatting: true,
    };
  }

  // Default known-but-unmatched: text flatten only; no claimed native CMR image handoff.
  return {
    family: "unknown",
    nativeCanonicalImageHandoff: false,
    compatibilityFlatten: true,
    structuredOutputFormatting: false,
  };
}
