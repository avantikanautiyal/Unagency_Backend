/**
 * Map routing/failover model ids onto wire models each LIVE leaf can execute.
 * Model Registry inventory is broader than leaf manifests (e.g. o1-mini).
 */

const DEFAULTS: Readonly<Record<string, string>> = {
  "provider.openai": "openai/gpt-4o",
  openai: "openai/gpt-4o",
  "provider.anthropic": "anthropic/claude-sonnet-4-5",
  anthropic: "anthropic/claude-sonnet-4-5",
  "provider.gemini": "gemini/gemini-3.6-flash",
  gemini: "gemini/gemini-3.6-flash",
  "provider.google": "google/gemini-2.5-flash-image",
  google: "google/gemini-2.5-flash-image",
  "provider.groq": "groq/llama-3.3-70b-versatile",
  groq: "groq/llama-3.3-70b-versatile",
  "provider.deepseek": "deepseek/deepseek-chat",
  deepseek: "deepseek/deepseek-chat",
  "provider.mistral": "mistral/mistral-small",
  mistral: "mistral/mistral-small",
  "provider.xai": "xai/grok-2",
  xai: "xai/grok-2",
  "provider.ideogram": "ideogram/ideogram-3",
  ideogram: "ideogram/ideogram-3",
};

/** Wire models known to be rejected by leaf adapters / vendor 404s. */
const UNSAFE_WIRE: ReadonlySet<string> = new Set([
  "o1-mini",
  "o1-preview",
  "o1",
  "o3-mini",
  // Not available to new Gemini API keys (404) — remapped below.
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-2.0-flash-001",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
  // Retired OpenAI image models
  "dall-e-3",
  "dall-e-2",
  // Imagen :predict deprecated for new Gemini API keys
  "imagen-4",
  "imagen-4.0-generate-001",
  "imagen-4.0-fast-generate-001",
  "imagen-4.0-ultra-generate-001",
  // Retired Anthropic dated snapshots (live API returns 404)
  "claude-3-5-sonnet-20241022",
  "claude-3-5-haiku-20241022",
  "claude-sonnet-4-20250514",
  "claude-opus-4-1-20250805",
  "claude-opus-4-20250514",
  "claude-3-opus-20240229",
  "claude-3-haiku-20240307",
]);

const ANTHROPIC_SAFE_REMAP: Readonly<Record<string, string>> = {
  "claude-3-5-sonnet": "claude-sonnet-4-5",
  "claude-3-5-sonnet-20241022": "claude-sonnet-4-5",
  "claude-sonnet-4": "claude-sonnet-4-6",
  "claude-sonnet-4-20250514": "claude-sonnet-4-6",
  "claude-opus-4-1": "claude-opus-4-6",
  "claude-opus-4-1-20250805": "claude-opus-4-6",
  "claude-opus-4-20250514": "claude-opus-4-5",
  "claude-3-opus": "claude-opus-4-5",
  "claude-3-opus-20240229": "claude-opus-4-5",
  "claude-3-haiku": "claude-haiku-4-5",
  "claude-3-haiku-20240307": "claude-haiku-4-5",
  "claude-3-5-haiku-20241022": "claude-haiku-4-5",
};

/** Retired Gemini text models → current Generative Language API ids. */
const GEMINI_SAFE_REMAP: Readonly<Record<string, string>> = {
  "gemini-2.5-flash": "gemini-3.6-flash",
  "gemini-2.5-pro": "gemini-pro-latest",
  "gemini-2.0-flash": "gemini-3.6-flash",
  "gemini-2.0-flash-001": "gemini-3.6-flash",
  "gemini-1.5-flash": "gemini-3.6-flash",
  "gemini-1.5-pro": "gemini-pro-latest",
};

const OPENAI_IMAGE_DEFAULT = "openai/gpt-image-1.5";
const GOOGLE_IMAGE_DEFAULT = "google/gemini-2.5-flash-image";
const IDEOGRAM_IMAGE_DEFAULT = "ideogram/ideogram-3";

function wireOf(modelId: string): string {
  if (!modelId.includes("/")) return modelId;
  return modelId.split("/").slice(-1)[0] ?? modelId;
}

function withVendorPrefix(providerId: string, wire: string): string {
  const p = providerId.replace(/^provider\./, "");
  if (wire.includes("/")) return wire;
  return `${p}/${wire}`;
}

/**
 * Returns a model id safe to dispatch for the given provider leaf.
 */
export function resolveExecutableModelId(
  providerId: string,
  modelId: string | undefined
): string {
  const vendor = providerId.replace(/^provider\./, "");
  const fallback = DEFAULTS[providerId] ?? DEFAULTS[vendor];
  if (!modelId?.trim()) {
    if (vendor === "openai") return OPENAI_IMAGE_DEFAULT;
    if (vendor === "google") return GOOGLE_IMAGE_DEFAULT;
    if (vendor === "ideogram") return IDEOGRAM_IMAGE_DEFAULT;
    return fallback ?? "openai/gpt-4o-mini";
  }

  const wire = wireOf(modelId.trim());

  if (vendor === "anthropic") {
    const remapped = ANTHROPIC_SAFE_REMAP[wire];
    if (remapped) {
      return withVendorPrefix(providerId, remapped);
    }
    if (UNSAFE_WIRE.has(wire)) {
      return DEFAULTS[providerId] ?? DEFAULTS.anthropic ?? "anthropic/claude-sonnet-4-5";
    }
  }

  if (vendor === "gemini") {
    const remapped = GEMINI_SAFE_REMAP[wire];
    if (remapped) {
      return withVendorPrefix(providerId, remapped);
    }
    if (UNSAFE_WIRE.has(wire)) {
      return DEFAULTS[providerId] ?? DEFAULTS.gemini ?? "gemini/gemini-3.6-flash";
    }
  }

  // OpenAI image path — never dispatch retired DALL·E; prefer gpt-image-1.5 (ChatGPT-class).
  if (vendor === "openai") {
    if (wire.includes("dall-e") || UNSAFE_WIRE.has(wire)) {
      // Only remap when this looks like an image (or unsafe) id — keep text models.
      if (
        wire.includes("dall-e") ||
        wire.includes("image") ||
        wire.includes("imagen")
      ) {
        return OPENAI_IMAGE_DEFAULT;
      }
    }
    if (wire.includes("gpt-image") || wire.includes("chatgpt-image")) {
      return withVendorPrefix(providerId, wire);
    }
  }

  if (vendor === "google") {
    if (wire.includes("imagen") || UNSAFE_WIRE.has(wire)) {
      return GOOGLE_IMAGE_DEFAULT;
    }
    if (wire.includes("image")) {
      return withVendorPrefix(providerId, wire);
    }
  }

  if (vendor === "ideogram") {
    if (wire.includes("ideogram") || wire === "V_3") {
      return withVendorPrefix(providerId, wire.includes("ideogram") ? wire : "ideogram-3");
    }
  }

  if (UNSAFE_WIRE.has(wire)) {
    return fallback ?? withVendorPrefix(providerId, "gpt-4o-mini");
  }

  // Cross-provider bleed: openai/o1-mini on Gemini, etc.
  if (
    modelId.includes("/") &&
    !modelId.startsWith(`${vendor}/`) &&
    !modelId.startsWith("provider.")
  ) {
    const prefix = modelId.split("/")[0];
    if (prefix && prefix !== vendor && prefix !== `provider.${vendor}`) {
      return fallback ?? withVendorPrefix(providerId, wire);
    }
  }

  return modelId.includes("/") ? modelId : withVendorPrefix(providerId, wire);
}
