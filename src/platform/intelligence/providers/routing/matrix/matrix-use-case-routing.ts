/**
 * Client provider matrix — cross-modality use-case preferences.
 * Only executable (credentialed + verified) providers are selected at runtime.
 */

export type MatrixProviderPref = {
  readonly providerId: string;
  readonly modelId: string;
  readonly label: string;
};

export type TextCreativeUseCase =
  | "strategy"
  | "copy"
  | "coding"
  | "creative"
  | "multilingual"
  | "research"
  | "general";

export type VideoCreativeUseCase =
  | "commercial_ad"
  | "filmmaking"
  | "cinematic"
  | "product"
  | "short_form"
  | "fast"
  | "marketing"
  | "fashion"
  | "general";

export type AudioCreativeUseCase =
  | "voiceover"
  | "realtime_agent"
  | "conversational"
  | "character"
  | "music"
  | "general";

/** LLM / reasoning preferences from the Unagency matrix. */
export const TEXT_USE_CASE_PREFERENCES: Record<
  TextCreativeUseCase,
  readonly MatrixProviderPref[]
> = {
  strategy: [
    // Anthropic first for decks/docs/strategy — live models remapped in adapter.
    { providerId: "provider.anthropic", modelId: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
    { providerId: "provider.openai", modelId: "gpt-4o", label: "GPT-4o" },
    { providerId: "provider.anthropic", modelId: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
    { providerId: "provider.openai", modelId: "gpt-4o-mini", label: "GPT-4o Mini" },
    { providerId: "provider.mistral", modelId: "mistral-large", label: "Mistral Large" },
  ],
  copy: [
    { providerId: "provider.anthropic", modelId: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
    { providerId: "provider.openai", modelId: "gpt-4o", label: "GPT-4o" },
    { providerId: "provider.openai", modelId: "gpt-4o-mini", label: "GPT-4o Mini" },
    { providerId: "provider.mistral", modelId: "mistral-small", label: "Mistral Small" },
  ],
  coding: [
    { providerId: "provider.anthropic", modelId: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
    { providerId: "provider.openai", modelId: "gpt-4o", label: "GPT-4o" },
    { providerId: "provider.mistral", modelId: "mistral-large", label: "Mistral Large" },
  ],
  creative: [
    { providerId: "provider.anthropic", modelId: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
    { providerId: "provider.openai", modelId: "gpt-4o", label: "GPT-4o" },
    { providerId: "provider.mistral", modelId: "mistral-large", label: "Mistral Large" },
  ],
  multilingual: [
    { providerId: "provider.openai", modelId: "gpt-4o", label: "GPT-4o" },
    { providerId: "provider.anthropic", modelId: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
    { providerId: "provider.gemini", modelId: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  ],
  research: [
    { providerId: "provider.openai", modelId: "gpt-4o", label: "GPT-4o" },
    { providerId: "provider.anthropic", modelId: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
    { providerId: "provider.gemini", modelId: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  ],
  general: [
    { providerId: "provider.anthropic", modelId: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
    { providerId: "provider.openai", modelId: "gpt-4o", label: "GPT-4o" },
    { providerId: "provider.openai", modelId: "gpt-4o-mini", label: "GPT-4o Mini" },
    { providerId: "provider.mistral", modelId: "mistral-small", label: "Mistral Small" },
  ],
};

export const VIDEO_USE_CASE_PREFERENCES: Record<
  VideoCreativeUseCase,
  readonly MatrixProviderPref[]
> = {
  commercial_ad: [
    { providerId: "provider.seedance", modelId: "seedance-2", label: "Seedance 2" },
    { providerId: "provider.google", modelId: "veo-3", label: "Veo 3" },
    { providerId: "provider.kling", modelId: "kling-2-1", label: "Kling" },
    { providerId: "provider.runway", modelId: "runway-gen-4", label: "Runway Gen-4" },
  ],
  filmmaking: [
    { providerId: "provider.seedance", modelId: "seedance-2", label: "Seedance 2" },
    { providerId: "provider.kling", modelId: "kling-2-1", label: "Kling" },
    { providerId: "provider.google", modelId: "veo-3", label: "Veo 3" },
    { providerId: "provider.runway", modelId: "runway-gen-4", label: "Runway Gen-4" },
  ],
  cinematic: [
    { providerId: "provider.seedance", modelId: "seedance-2", label: "Seedance 2" },
    { providerId: "provider.kling", modelId: "kling-2-1", label: "Kling" },
    { providerId: "provider.google", modelId: "veo-3", label: "Veo 3" },
    { providerId: "provider.runway", modelId: "runway-gen-4", label: "Runway Gen-4" },
    { providerId: "provider.luma", modelId: "luma-ray-2", label: "Luma Ray 2" },
  ],
  product: [
    { providerId: "provider.seedance", modelId: "seedance-2", label: "Seedance 2" },
    { providerId: "provider.luma", modelId: "luma-ray-2", label: "Luma Ray 2" },
    { providerId: "provider.pixverse", modelId: "pixverse-v4", label: "PixVerse V4" },
    { providerId: "provider.runway", modelId: "runway-gen-4", label: "Runway Gen-4" },
  ],
  short_form: [
    { providerId: "provider.seedance", modelId: "seedance-2", label: "Seedance 2" },
    { providerId: "provider.minimax", modelId: "hailuo-ai", label: "Hailuo AI" },
    { providerId: "provider.pixverse", modelId: "pixverse-v4", label: "PixVerse V4" },
    { providerId: "provider.luma", modelId: "luma-ray-2", label: "Luma Ray 2" },
  ],
  fast: [
    { providerId: "provider.minimax", modelId: "hailuo-ai", label: "Hailuo AI" },
    { providerId: "provider.pixverse", modelId: "pixverse-v4", label: "PixVerse V4" },
    { providerId: "provider.seedance", modelId: "seedance-2", label: "Seedance 2" },
  ],
  marketing: [
    { providerId: "provider.seedance", modelId: "seedance-2", label: "Seedance 2" },
    { providerId: "provider.pixverse", modelId: "pixverse-v4", label: "PixVerse V4" },
    { providerId: "provider.runway", modelId: "runway-gen-4", label: "Runway Gen-4" },
    { providerId: "provider.google", modelId: "veo-3", label: "Veo 3" },
  ],
  fashion: [
    { providerId: "provider.seedance", modelId: "seedance-2", label: "Seedance 2" },
    { providerId: "provider.runway", modelId: "runway-gen-4", label: "Runway Gen-4" },
    { providerId: "provider.kling", modelId: "kling-2-1", label: "Kling" },
    { providerId: "provider.luma", modelId: "luma-ray-2", label: "Luma Ray 2" },
  ],
  general: [
    { providerId: "provider.seedance", modelId: "seedance-2", label: "Seedance 2" },
    { providerId: "provider.google", modelId: "veo-3", label: "Veo 3" },
    { providerId: "provider.kling", modelId: "kling-2-1", label: "Kling" },
    { providerId: "provider.runway", modelId: "runway-gen-4", label: "Runway Gen-4" },
    { providerId: "provider.luma", modelId: "luma-ray-2", label: "Luma Ray 2" },
    { providerId: "provider.minimax", modelId: "hailuo-ai", label: "Hailuo AI" },
    { providerId: "provider.pixverse", modelId: "pixverse-v4", label: "PixVerse V4" },
  ],
};

export const AUDIO_USE_CASE_PREFERENCES: Record<
  AudioCreativeUseCase,
  readonly MatrixProviderPref[]
> = {
  voiceover: [
    { providerId: "provider.elevenlabs", modelId: "eleven-turbo-v2-5", label: "ElevenLabs" },
    { providerId: "provider.openai", modelId: "tts-1", label: "GPT Voice" },
    { providerId: "provider.cartesia", modelId: "sonic-2", label: "Cartesia Sonic" },
  ],
  realtime_agent: [
    { providerId: "provider.cartesia", modelId: "sonic-2", label: "Cartesia Sonic" },
    { providerId: "provider.elevenlabs", modelId: "eleven-turbo-v2-5", label: "ElevenLabs" },
    { providerId: "provider.openai", modelId: "tts-1", label: "GPT Voice" },
  ],
  conversational: [
    { providerId: "provider.openai", modelId: "tts-1", label: "GPT Voice" },
    { providerId: "provider.elevenlabs", modelId: "eleven-turbo-v2-5", label: "ElevenLabs" },
    { providerId: "provider.cartesia", modelId: "sonic-2", label: "Cartesia Sonic" },
  ],
  character: [
    { providerId: "provider.elevenlabs", modelId: "eleven-turbo-v2-5", label: "ElevenLabs" },
    { providerId: "provider.openai", modelId: "tts-1", label: "GPT Voice" },
  ],
  music: [
    // Suno blocked until verified — fall through to voice leaves only as placeholder.
    { providerId: "provider.elevenlabs", modelId: "eleven-turbo-v2-5", label: "ElevenLabs" },
  ],
  general: [
    { providerId: "provider.elevenlabs", modelId: "eleven-turbo-v2-5", label: "ElevenLabs" },
    { providerId: "provider.openai", modelId: "tts-1", label: "GPT Voice" },
    { providerId: "provider.cartesia", modelId: "sonic-2", label: "Cartesia Sonic" },
  ],
};

export function resolveTextCreativeUseCase(prompt: string): TextCreativeUseCase {
  const hay = prompt.toLowerCase();
  if (/\b(code|coding|programming|typescript|python|refactor|bug)\b/.test(hay)) {
    return "coding";
  }
  if (/\b(research|web\s*search|cite|sources|sonar)\b/.test(hay)) {
    return "research";
  }
  if (
    /\b(strategy|roadmap|plan|architecture|qa|pitch\s*deck|presentation|slides?|brochure|guidelines?|brand\s*strategy|document)\b/.test(
      hay
    )
  ) {
    return "strategy";
  }
  if (/\b(multilingual|translate|localization|arabic|hindi|chinese)\b/.test(hay)) {
    return "multilingual";
  }
  if (/\b(creative|trending|campaign\s*idea|brainstorm)\b/.test(hay)) {
    return "creative";
  }
  if (/\b(copy|headline|tagline|email|landing\s*page\s*copy|write)\b/.test(hay)) {
    return "copy";
  }
  return "general";
}

/** Prefer strategy routing when product metadata declares deck/doc/strategy outputs. */
export function resolveTextCreativeUseCaseFromMetadata(
  prompt: string,
  metadata?: Readonly<Record<string, unknown>>
): TextCreativeUseCase {
  const outputKind =
    typeof metadata?.outputKind === "string"
      ? metadata.outputKind.toLowerCase()
      : "";
  const mediaKind =
    typeof metadata?.mediaKind === "string" ? metadata.mediaKind.toLowerCase() : "";
  const service =
    typeof metadata?.service === "string" ? metadata.service.toLowerCase() : "";

  if (
    outputKind === "presentation" ||
    outputKind === "document" ||
    mediaKind === "presentation" ||
    mediaKind === "document" ||
    service === "strategy" ||
    service === "presentations"
  ) {
    return "strategy";
  }
  if (
    outputKind === "text" ||
    mediaKind === "copy" ||
    (service === "social" &&
      typeof metadata?.subtype === "string" &&
      /copywriting|strategy/.test(metadata.subtype.toLowerCase()))
  ) {
    return "copy";
  }
  return resolveTextCreativeUseCase(prompt);
}

export function resolveVideoCreativeUseCase(prompt: string): VideoCreativeUseCase {
  const hay = prompt.toLowerCase();
  if (/\b(fashion|runway\s*look|apparel)\b/.test(hay)) return "fashion";
  if (/\b(commercial|tv\s*ad|brand\s*ad)\b/.test(hay)) return "commercial_ad";
  if (/\b(film|cinematic|movie)\b/.test(hay)) return "filmmaking";
  if (/\b(product\s*video|packshot|unboxing)\b/.test(hay)) return "product";
  if (/\b(reel|short[- ]?form|tiktok|shorts)\b/.test(hay)) return "short_form";
  if (/\b(fast|quick|rapid)\b/.test(hay)) return "fast";
  if (/\b(marketing|promo|campaign)\b/.test(hay)) return "marketing";
  if (/\b(cinematic|drama)\b/.test(hay)) return "cinematic";
  return "general";
}

export function resolveAudioCreativeUseCase(prompt: string): AudioCreativeUseCase {
  const hay = prompt.toLowerCase();
  if (/\b(music|song|soundtrack|jingle)\b/.test(hay)) return "music";
  if (/\b(realtime|real[- ]time|agent|ivr)\b/.test(hay)) return "realtime_agent";
  if (/\b(character|persona|actor)\b/.test(hay)) return "character";
  if (/\b(conversational|dialogue|chat)\b/.test(hay)) return "conversational";
  if (/\b(voiceover|voice[- ]over|narration|tts|speech)\b/.test(hay)) return "voiceover";
  return "general";
}

export function pickFirstExecutablePref(
  prefs: readonly MatrixProviderPref[],
  executableProviderIds: ReadonlySet<string>
): MatrixProviderPref | undefined {
  for (const pref of prefs) {
    if (executableProviderIds.has(pref.providerId)) return pref;
  }
  return undefined;
}
