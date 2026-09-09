/**
 * Client provider matrix — cross-modality use-case preferences.
 * Only executable (credentialed + verified) providers are selected at runtime.
 */

import {
  resolveAudioUseCaseFromService,
  resolveImageUseCaseFromService,
  resolveTextUseCaseFromService,
  resolveVideoUseCaseFromService,
  type AudioCreativeUseCase,
  type ImageCreativeUseCase,
  type ServiceRoutingContext,
  type TextCreativeUseCase,
  type VideoCreativeUseCase,
} from "./service-matrix-routing";

export type {
  AudioCreativeUseCase,
  ImageCreativeUseCase,
  TextCreativeUseCase,
  VideoCreativeUseCase,
} from "./service-matrix-routing";

export type MatrixProviderPref = {
  readonly providerId: string;
  readonly modelId: string;
  readonly label: string;
};

/** Live web-search providers (Tavily / Exa / Perplexity). */
export const RESEARCH_WEB_SEARCH_PREFERENCES: readonly MatrixProviderPref[] = [
  { providerId: "provider.tavily", modelId: "tavily-search", label: "Tavily AI" },
  { providerId: "provider.exa", modelId: "exa-search", label: "Exa Search API" },
  { providerId: "provider.perplexity", modelId: "sonar", label: "Perplexity Sonar" },
  {
    providerId: "provider.perplexity",
    modelId: "sonar-deep-research",
    label: "Perplexity Deep Research",
  },
];

/** LLM / reasoning preferences from the Unagency provider matrix. */
export const TEXT_USE_CASE_PREFERENCES: Record<
  TextCreativeUseCase,
  readonly MatrixProviderPref[]
> = {
  strategy: [
    { providerId: "provider.anthropic", modelId: "claude-opus-4-1", label: "Claude Opus 4.1" },
    { providerId: "provider.openai", modelId: "gpt-5.5", label: "GPT-5.5" },
    { providerId: "provider.gemini", modelId: "gemini-pro-latest", label: "Gemini 2.5 Pro" },
    { providerId: "provider.anthropic", modelId: "claude-sonnet-4-5", label: "Claude Sonnet 4" },
    { providerId: "provider.mistral", modelId: "mistral-large", label: "Mistral Large" },
    { providerId: "provider.deepseek", modelId: "deepseek-reasoner", label: "DeepSeek R1" },
    { providerId: "provider.moonshot", modelId: "kimi-k2", label: "Kimi K2" },
  ],
  copy: [
    { providerId: "provider.anthropic", modelId: "claude-sonnet-4-5", label: "Claude Sonnet 4" },
    { providerId: "provider.openai", modelId: "gpt-4o", label: "GPT-4o" },
    { providerId: "provider.gemini", modelId: "gemini-flash-latest", label: "Gemini Flash" },
    { providerId: "provider.mistral", modelId: "mistral-small", label: "Mistral Small" },
    {
      providerId: "provider.meta",
      modelId: "Llama-4-Scout-17B-16E-Instruct",
      label: "Llama 4 Scout",
    },
  ],
  coding: [
    { providerId: "provider.openai", modelId: "gpt-5.5", label: "Codex / GPT-5.5" },
    { providerId: "provider.anthropic", modelId: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
    { providerId: "provider.deepseek", modelId: "deepseek-reasoner", label: "DeepSeek R1" },
    { providerId: "provider.moonshot", modelId: "kimi-k2", label: "Kimi K2" },
    { providerId: "provider.gemini", modelId: "gemini-pro-latest", label: "Gemini 2.5 Pro" },
    {
      providerId: "provider.meta",
      modelId: "Llama-4-Maverick-17B-128E-Instruct-FP8",
      label: "Llama 4 Maverick",
    },
  ],
  website: [
    // Prefer OpenAI Codex / GPT-5.5 for production-quality site code; Anthropic for design failover.
    { providerId: "provider.openai", modelId: "gpt-5.5", label: "Codex / GPT-5.5" },
    { providerId: "provider.anthropic", modelId: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
    { providerId: "provider.anthropic", modelId: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
    { providerId: "provider.gemini", modelId: "gemini-pro-latest", label: "Gemini 2.5 Pro" },
    { providerId: "provider.deepseek", modelId: "deepseek-reasoner", label: "DeepSeek R1" },
    { providerId: "provider.moonshot", modelId: "kimi-k2", label: "Kimi K2" },
    { providerId: "provider.anthropic", modelId: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  ],
  creative: [
    { providerId: "provider.xai", modelId: "grok-4", label: "Grok 4" },
    { providerId: "provider.openai", modelId: "gpt-4o", label: "GPT-4o" },
    { providerId: "provider.anthropic", modelId: "claude-sonnet-4-5", label: "Claude Sonnet 4" },
    { providerId: "provider.mistral", modelId: "magistral-medium", label: "Magistral" },
    { providerId: "provider.gemini", modelId: "gemini-pro-latest", label: "Gemini Flow" },
    { providerId: "provider.xai", modelId: "grok-2", label: "Higgsfield AI (alt)" },
  ],
  multilingual: [
    { providerId: "provider.openai", modelId: "gpt-4o", label: "GPT-4o" },
    { providerId: "provider.gemini", modelId: "gemini-pro-latest", label: "Gemini 2.5 Pro" },
    { providerId: "provider.mistral", modelId: "mistral-large", label: "Mistral Large" },
    { providerId: "provider.deepseek", modelId: "deepseek-chat", label: "DeepSeek" },
    {
      providerId: "provider.meta",
      modelId: "Llama-4-Maverick-17B-128E-Instruct-FP8",
      label: "Llama 4 Maverick",
    },
  ],
  research: [
    { providerId: "provider.gemini", modelId: "gemini-pro-latest", label: "Gemini Deep Research" },
    { providerId: "provider.openai", modelId: "gpt-4o", label: "GPT-4o" },
    { providerId: "provider.anthropic", modelId: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
    { providerId: "provider.perplexity", modelId: "sonar", label: "Perplexity Sonar" },
  ],
  general: [
    { providerId: "provider.openai", modelId: "gpt-5.5", label: "GPT-5.5" },
    { providerId: "provider.anthropic", modelId: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
    { providerId: "provider.gemini", modelId: "gemini-pro-latest", label: "Gemini 2.5 Pro" },
    { providerId: "provider.mistral", modelId: "mistral-large", label: "Mistral Large" },
    { providerId: "provider.openai", modelId: "gpt-4o-mini", label: "GPT-4o Mini" },
  ],
};

/** Paused in production — excluded from LIVE video routing (credits, auth, or prompt limits). */
export const PAUSED_VIDEO_PROVIDER_IDS: ReadonlySet<string> = new Set([
  "provider.seedance",
  "provider.runway",
  "provider.google",
  "provider.pixverse",
]);

export const KLING_VIDEO_PREF: MatrixProviderPref = {
  providerId: "provider.kling",
  modelId: "kling-2-1",
  label: "Kling",
};

export const LUMA_VIDEO_PREF: MatrixProviderPref = {
  providerId: "provider.luma",
  modelId: "luma-ray-2",
  label: "Luma Ray 2",
};

export const MINIMAX_VIDEO_PREF: MatrixProviderPref = {
  providerId: "provider.minimax",
  modelId: "hailuo-ai",
  label: "Hailuo AI",
};

/** Active LIVE video engines — Kling, Luma, MiniMax. */
export const ACTIVE_VIDEO_PROVIDER_PREFERENCES: readonly MatrixProviderPref[] = [
  KLING_VIDEO_PREF,
  LUMA_VIDEO_PREF,
  MINIMAX_VIDEO_PREF,
];

export const VIDEO_USE_CASE_PREFERENCES: Record<
  VideoCreativeUseCase,
  readonly MatrixProviderPref[]
> = {
  commercial_ad: [
    KLING_VIDEO_PREF,
    LUMA_VIDEO_PREF,
    MINIMAX_VIDEO_PREF,
  ],
  filmmaking: [
    KLING_VIDEO_PREF,
    LUMA_VIDEO_PREF,
    MINIMAX_VIDEO_PREF,
  ],
  cinematic: [
    KLING_VIDEO_PREF,
    LUMA_VIDEO_PREF,
    MINIMAX_VIDEO_PREF,
  ],
  product: [
    LUMA_VIDEO_PREF,
    MINIMAX_VIDEO_PREF,
    KLING_VIDEO_PREF,
  ],
  short_form: [
    MINIMAX_VIDEO_PREF,
    KLING_VIDEO_PREF,
    LUMA_VIDEO_PREF,
  ],
  fast: [MINIMAX_VIDEO_PREF, KLING_VIDEO_PREF],
  marketing: [
    KLING_VIDEO_PREF,
    LUMA_VIDEO_PREF,
    MINIMAX_VIDEO_PREF,
  ],
  fashion: [
    LUMA_VIDEO_PREF,
    KLING_VIDEO_PREF,
    MINIMAX_VIDEO_PREF,
  ],
  general: ACTIVE_VIDEO_PROVIDER_PREFERENCES,
};

export const AUDIO_USE_CASE_PREFERENCES: Record<
  AudioCreativeUseCase,
  readonly MatrixProviderPref[]
> = {
  voiceover: [
    { providerId: "provider.elevenlabs", modelId: "eleven-turbo-v2-5", label: "Eleven v3" },
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
    { providerId: "provider.suno", modelId: "suno-v4", label: "Suno v4" },
    { providerId: "provider.elevenlabs", modelId: "eleven-turbo-v2-5", label: "Eleven v3" },
  ],
  general: [
    { providerId: "provider.elevenlabs", modelId: "eleven-turbo-v2-5", label: "ElevenLabs" },
    { providerId: "provider.openai", modelId: "tts-1", label: "GPT Voice" },
    { providerId: "provider.cartesia", modelId: "sonic-2", label: "Cartesia Sonic" },
  ],
};

export function resolveTextCreativeUseCase(prompt: string): TextCreativeUseCase {
  const hay = prompt.toLowerCase();
  // Non-Latin / mixed-script briefs → multilingual model lane (not English keyword sniffing).
  if (
    /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F\u0E00-\u0E7F\u0E80-\u0EFF\u1000-\u109F\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/.test(
      prompt
    )
  ) {
    return "multilingual";
  }
  if (
    /\b(code|coding|programming|typescript|python|refactor|bug|website|landing\s*page|web\s*app|frontend|next\.?js|react)\b/.test(
      hay
    )
  ) {
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
  if (/\b(multilingual|translate|localization|arabic|hindi|chinese|hinglish)\b/.test(hay)) {
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
  const ctx = routingContextFromMetadata(metadata);
  const fromService = resolveTextUseCaseFromService(
    ctx,
    typeof metadata?.outputKind === "string" ? metadata.outputKind : undefined
  );
  if (fromService) return fromService;

  const outputKind =
    typeof metadata?.outputKind === "string"
      ? metadata.outputKind.toLowerCase()
      : "";
  const mediaKind =
    typeof metadata?.mediaKind === "string" ? metadata.mediaKind.toLowerCase() : "";
  const service =
    typeof metadata?.service === "string" ? metadata.service.toLowerCase() : "";

  if (service === "website" || outputKind === "deferred_website" || outputKind === "website") {
    return "website";
  }
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

export function resolveVideoCreativeUseCase(
  prompt: string,
  context?: ServiceRoutingContext
): VideoCreativeUseCase {
  const fromService = context ? resolveVideoUseCaseFromService(context) : undefined;
  if (fromService) return fromService;

  const hay = prompt.toLowerCase();
  const productHay =
    `${context?.service ?? ""} ${context?.platform ?? ""} ${context?.subtype ?? ""}`.toLowerCase();
  const service = (context?.service ?? "").trim().toLowerCase();
  const isVideoService =
    service === "video" || /\bvideo\s*&\s*motion\b/.test(productHay);

  if (/\b(fashion|runway\s*look|apparel)\b/.test(hay)) return "fashion";
  if (/\b(commercial|tv\s*ad|brand\s*ad)\b/.test(hay)) return "commercial_ad";
  if (/\b(film|cinematic|movie)\b/.test(hay)) return "filmmaking";
  if (/\b(product\s*video|packshot|unboxing)\b/.test(hay)) return "product";
  if (
    /\b(reel|short[- ]?form|tiktok|shorts)\b/.test(hay) ||
    /\breels?\b/.test(productHay)
  ) {
    return "short_form";
  }
  if (/\b(fast|quick|rapid)\b/.test(hay)) return "fast";
  if (/\b(marketing|promo|campaign)\b/.test(hay)) return "marketing";
  if (/\b(cinematic|drama)\b/.test(hay)) return "cinematic";
  if (isVideoService) return "marketing";
  return "general";
}

export function resolveAudioCreativeUseCase(
  prompt: string,
  context?: ServiceRoutingContext
): AudioCreativeUseCase {
  const fromService = context ? resolveAudioUseCaseFromService(context) : undefined;
  if (fromService) return fromService;

  const hay = prompt.toLowerCase();
  if (/\b(music|song|soundtrack|jingle)\b/.test(hay)) return "music";
  if (/\b(realtime|real[- ]time|agent|ivr)\b/.test(hay)) return "realtime_agent";
  if (/\b(character|persona|actor)\b/.test(hay)) return "character";
  if (/\b(conversational|dialogue|chat)\b/.test(hay)) return "conversational";
  if (/\b(voiceover|voice[- ]over|narration|tts|speech)\b/.test(hay)) return "voiceover";
  return "general";
}

function routingContextFromMetadata(
  metadata?: Readonly<Record<string, unknown>>
): ServiceRoutingContext {
  return {
    service:
      typeof metadata?.service === "string" ? metadata.service : undefined,
    subtype:
      typeof metadata?.subtype === "string" ? metadata.subtype : undefined,
    platform:
      typeof metadata?.platform === "string" ? metadata.platform : undefined,
  };
}

export function resolveImageCreativeUseCaseFromContext(
  prompt: string,
  context?: ServiceRoutingContext
): ImageCreativeUseCase {
  const fromService = context ? resolveImageUseCaseFromService(context) : undefined;
  if (fromService) return fromService;

  const hay = prompt.toLowerCase();
  const service = (context?.service ?? "").trim().toLowerCase();
  const productHay = `${context?.service ?? ""} ${context?.platform ?? ""} ${context?.subtype ?? ""}`.toLowerCase();
  const isAdsService =
    service === "ads" ||
    service === "campaigns" ||
    /\bad\s*campaigns?\b/.test(productHay);
  const isSocialService =
    service === "social" || /\bsocial\s*media\b/.test(productHay);
  const isSocialDeliverable =
    isSocialService ||
    ((!service || isSocialService) &&
      (/\binstagram\b/.test(productHay) ||
        /\b(linkedin|facebook|tiktok|twitter|x\.com)\b/.test(productHay)));
  const explicitLogoJob =
    /\b(create|design|make|need|want|build)\s+(a\s+)?(new\s+)?(logo|wordmark|logotype)\b/.test(hay);

  if (isAdsService && !explicitLogoJob) return "marketing_creative";
  if (isSocialDeliverable && !explicitLogoJob) return "marketing_creative";
  if (/\b(logo|wordmark|brand\s*mark|vector\s*logo|logotype)\b/.test(hay)) {
    const referenceLogo =
      isSocialDeliverable ||
      /\b(use|with|from|attach(ed)?|include|featur(e|ing)|reference)\b.{0,48}\b(logo|brand\s*mark)\b/.test(hay) ||
      /\b(logo|brand\s*mark)\b.{0,48}\b(as reference|attached|in the (post|creative|design|layout))\b/.test(hay);
    if (!referenceLogo || explicitLogoJob) return "logo";
  }
  if (/\b(poster|typography|typeface|lettering|typographic)\b/.test(hay)) return "typography";
  if (/\b(photo\s*real|photoreal|product\s*shot|packshot|lifestyle\s*photo)\b/.test(hay)) {
    return "photorealistic";
  }
  if (/\b(brand\s*imag|branding\s*visual|visual\s*identity|brand\s*system)\b/.test(hay)) {
    return "brand_imagery";
  }
  if (/\b(product\s*visual|product\s*mock|packaging\s*visual)\b/.test(hay)) return "product";
  if (
    /\bretouch/.test(productHay) ||
    /\b(retouch|colour\s*correct|color\s*correct|cleanup|composit)\b/.test(hay)
  ) {
    return "photorealistic";
  }
  if (/\b(landing\s*page|marketing|campaign|creative|banner|ad\b|hero|instagram|social)\b/.test(hay)) {
    return "marketing_creative";
  }
  if (/\b(design|image|visual|illustration)\b/.test(hay)) return "general";
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
