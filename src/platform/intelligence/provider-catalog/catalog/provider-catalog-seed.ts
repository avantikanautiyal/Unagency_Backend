/**
 * Official UNAGENCY Provider Catalog — seeded from the Provider Catalog spreadsheet.
 * Source of truth for departments, providers, bootstrap models, capabilities, and used-in.
 * Do not invent providers outside this seed.
 */

export type CatalogDepartment =
  | "llm"
  | "research"
  | "image_generation"
  | "video_generation"
  | "voice_generation"
  | "music"
  | "audio"
  | "three_d";

export interface CatalogModelRow {
  readonly modelLabel: string;
  readonly capabilities: readonly string[];
  readonly usedIn: readonly string[];
}

export interface CatalogProviderEntry {
  readonly providerId: string;
  readonly displayName: string;
  readonly department: CatalogDepartment;
  /** Secondary departments when same provider appears in multiple spreadsheet sections. */
  readonly additionalDepartments?: readonly CatalogDepartment[];
  readonly models: readonly CatalogModelRow[];
  readonly discoveryEndpoint: string;
  readonly baseUrl: string;
  readonly envVarHint: string;
  readonly existingLeaf?: "openai";
}

function m(
  modelLabel: string,
  capabilities: string,
  usedIn: string
): CatalogModelRow {
  return {
    modelLabel,
    capabilities: capabilities.split(",").map((s) => s.trim()),
    usedIn: usedIn.split(",").map((s) => s.trim()),
  };
}

/**
 * Canonical catalog rows aggregated by unique provider.
 * Models are bootstrap inventory until live discovery is enabled.
 */
export const PROVIDER_CATALOG_SEED: readonly CatalogProviderEntry[] = [
  {
    providerId: "openai",
    displayName: "OpenAI",
    department: "llm",
    additionalDepartments: ["image_generation", "voice_generation"],
    existingLeaf: "openai",
    discoveryEndpoint: "/v1/models",
    baseUrl: "https://api.openai.com",
    envVarHint: "OPENAI_API_KEY",
    models: [
      m("GPT-5.5", "General reasoning, strategy, coding, planning", "Campaigns, Landing Pages"),
      m("GPT Image", "Marketing creatives, editing", "Campaigns, Landing Pages"),
      m("GPT Voice", "Conversational voice", "Campaigns"),
    ],
  },
  {
    providerId: "anthropic",
    displayName: "Anthropic",
    department: "llm",
    discoveryEndpoint: "/v1/models",
    baseUrl: "https://api.anthropic.com",
    envVarHint: "ANTHROPIC_API_KEY",
    models: [
      m("Claude Opus 4.1", "Long reasoning, architecture, QA", "Campaigns, Landing Pages"),
      m("Claude Sonnet 4", "Fast content generation", "Campaigns, Landing Pages"),
    ],
  },
  {
    providerId: "google",
    displayName: "Google",
    department: "llm",
    additionalDepartments: ["image_generation", "video_generation"],
    discoveryEndpoint: "/v1beta/models",
    baseUrl: "https://generativelanguage.googleapis.com",
    envVarHint: "GOOGLE_API_KEY",
    models: [
      m("Gemini 2.5 Pro", "Multimodal reasoning, UX, coding", "Campaigns, Landing Pages"),
      m("Gemini Flash", "Low-latency inference", "Campaigns"),
      m("Imagen 4", "Photorealistic assets", "Campaigns, Landing Pages"),
      m("Veo 3", "Commercial ads", "Campaigns"),
    ],
  },
  {
    providerId: "xai",
    displayName: "xAI",
    department: "llm",
    discoveryEndpoint: "/v1/models",
    baseUrl: "https://api.x.ai",
    envVarHint: "XAI_API_KEY",
    models: [m("Grok 4", "Creative thinking, trending content", "Campaigns")],
  },
  {
    providerId: "deepseek",
    displayName: "DeepSeek",
    department: "llm",
    discoveryEndpoint: "/models",
    baseUrl: "https://api.deepseek.com",
    envVarHint: "DEEPSEEK_API_KEY",
    models: [
      m("DeepSeek R1", "Programming, mathematical reasoning", "Campaigns, Landing Pages"),
    ],
  },
  {
    providerId: "alibaba",
    displayName: "Alibaba",
    department: "llm",
    discoveryEndpoint: "/compatible-mode/v1/models",
    baseUrl: "https://dashscope.aliyuncs.com",
    envVarHint: "ALIBABA_API_KEY",
    models: [
      m("Qwen 3 235B", "Multilingual reasoning", "Campaigns, Landing Pages"),
    ],
  },
  {
    providerId: "moonshot",
    displayName: "Moonshot AI",
    department: "llm",
    discoveryEndpoint: "/v1/models",
    baseUrl: "https://api.moonshot.cn",
    envVarHint: "MOONSHOT_API_KEY",
    models: [
      m("Kimi K2", "Long-context reasoning, coding", "Campaigns, Landing Pages"),
    ],
  },
  {
    providerId: "meta",
    displayName: "Meta",
    department: "llm",
    discoveryEndpoint: "/v1/models",
    baseUrl: "https://api.llama.meta.com",
    envVarHint: "META_API_KEY",
    models: [
      m("Llama 4 Maverick", "Open-weight reasoning", "Campaigns"),
      m("Llama 4 Scout", "Fast lightweight reasoning", "Campaigns"),
    ],
  },
  {
    providerId: "mistral",
    displayName: "Mistral AI",
    department: "llm",
    discoveryEndpoint: "/v1/models",
    baseUrl: "https://api.mistral.ai",
    envVarHint: "MISTRAL_API_KEY",
    models: [
      m("Mistral Large", "Enterprise reasoning", "Campaigns, Landing Pages"),
      m("Magistral", "Advanced reasoning", "Campaigns"),
    ],
  },
  {
    providerId: "higgsfield",
    displayName: "Higgsfield",
    department: "llm",
    additionalDepartments: ["video_generation"],
    discoveryEndpoint: "/v1/models",
    baseUrl: "https://api.higgsfield.ai",
    envVarHint: "HIGGSFIELD_API_KEY",
    models: [
      m("Higgsfield AI", "Creative ideation", "Campaigns"),
      m("Higgsfield Video", "Fashion/cinematic ads", "Campaigns"),
    ],
  },
  {
    providerId: "perplexity",
    displayName: "Perplexity",
    department: "research",
    discoveryEndpoint: "/chat/completions",
    baseUrl: "https://api.perplexity.ai",
    envVarHint: "PERPLEXITY_API_KEY",
    models: [
      m("Perplexity Sonar", "Live web search", "Campaigns"),
      m("Perplexity Sonar Deep Research", "Deep research", "Campaigns"),
    ],
  },
  {
    providerId: "blackforestlabs",
    displayName: "Black Forest Labs",
    department: "image_generation",
    discoveryEndpoint: "/v1/models",
    baseUrl: "https://api.bfl.ai",
    envVarHint: "BFL_API_KEY",
    models: [
      m("FLUX Kontext Pro", "Brand imagery", "Campaigns, Landing Pages"),
      m("FLUX Pro 1.1", "High-quality image generation", "Campaigns"),
    ],
  },
  {
    providerId: "ideogram",
    displayName: "Ideogram",
    department: "image_generation",
    discoveryEndpoint: "/v1/models",
    baseUrl: "https://api.ideogram.ai",
    envVarHint: "IDEOGRAM_API_KEY",
    models: [m("Ideogram 3", "Typography, posters", "Campaigns")],
  },
  {
    providerId: "recraft",
    displayName: "Recraft",
    department: "image_generation",
    discoveryEndpoint: "/v1/models",
    baseUrl: "https://external.api.recraft.ai",
    envVarHint: "RECRAFT_API_KEY",
    models: [m("Recraft V3", "Logos, vectors", "Campaigns")],
  },
  {
    providerId: "midjourney",
    displayName: "Midjourney",
    department: "image_generation",
    discoveryEndpoint: "/v1/models",
    baseUrl: "https://api.midjourney.com",
    envVarHint: "MIDJOURNEY_API_KEY",
    models: [m("Midjourney V7", "Artistic marketing visuals", "Campaigns")],
  },
  {
    providerId: "hidream",
    displayName: "HiDream",
    department: "image_generation",
    discoveryEndpoint: "/v1/models",
    baseUrl: "https://api.hidream.ai",
    envVarHint: "HIDREAM_API_KEY",
    models: [m("HiDream-I1", "Commercial imagery", "Campaigns")],
  },
  {
    providerId: "reve",
    displayName: "Reve AI",
    department: "image_generation",
    discoveryEndpoint: "/v1/models",
    baseUrl: "https://api.reve.ai",
    envVarHint: "REVE_API_KEY",
    models: [m("Reve Image", "Product visualization", "Campaigns")],
  },
  {
    providerId: "runway",
    displayName: "Runway",
    department: "video_generation",
    discoveryEndpoint: "/v1/models",
    baseUrl: "https://api.dev.runwayml.com",
    envVarHint: "RUNWAY_API_KEY",
    models: [m("Runway Gen-4", "AI filmmaking", "Campaigns")],
  },
  {
    providerId: "kling",
    displayName: "Kling AI",
    department: "video_generation",
    discoveryEndpoint: "/v1/models",
    baseUrl: "https://api.klingai.com",
    envVarHint: "KLING_API_KEY",
    models: [m("Kling 2.1", "Cinematic videos", "Campaigns")],
  },
  {
    providerId: "luma",
    displayName: "Luma AI",
    department: "video_generation",
    discoveryEndpoint: "/v1/models",
    baseUrl: "https://api.lumalabs.ai",
    envVarHint: "LUMA_API_KEY",
    models: [m("Luma Ray 2", "Product videos", "Campaigns")],
  },
  {
    providerId: "pika",
    displayName: "Pika",
    department: "video_generation",
    discoveryEndpoint: "/v1/models",
    baseUrl: "https://api.pika.art",
    envVarHint: "PIKA_API_KEY",
    models: [m("Pika 2.2", "Short-form videos", "Campaigns")],
  },
  {
    providerId: "minimax",
    displayName: "MiniMax",
    department: "video_generation",
    discoveryEndpoint: "/v1/models",
    baseUrl: "https://api.minimax.chat",
    envVarHint: "MINIMAX_API_KEY",
    models: [m("Hailuo AI", "Fast video generation", "Campaigns")],
  },
  {
    providerId: "pixverse",
    displayName: "PixVerse",
    department: "video_generation",
    discoveryEndpoint: "/v1/models",
    baseUrl: "https://api.pixverse.ai",
    envVarHint: "PIXVERSE_API_KEY",
    models: [m("PixVerse V4", "Marketing videos", "Campaigns")],
  },
  {
    providerId: "elevenlabs",
    displayName: "ElevenLabs",
    department: "voice_generation",
    discoveryEndpoint: "/v1/models",
    baseUrl: "https://api.elevenlabs.io",
    envVarHint: "ELEVENLABS_API_KEY",
    models: [m("Eleven v3", "Voiceovers", "Campaigns")],
  },
  {
    providerId: "cartesia",
    displayName: "Cartesia",
    department: "voice_generation",
    discoveryEndpoint: "/models",
    baseUrl: "https://api.cartesia.ai",
    envVarHint: "CARTESIA_API_KEY",
    models: [m("Cartesia Sonic", "Real-time voice agents", "Campaigns")],
  },
  {
    providerId: "playai",
    displayName: "PlayAI",
    department: "voice_generation",
    discoveryEndpoint: "/v1/models",
    baseUrl: "https://api.play.ai",
    envVarHint: "PLAYAI_API_KEY",
    models: [m("PlayDialog", "Character voices", "Campaigns")],
  },
  {
    providerId: "sesame",
    displayName: "Sesame",
    department: "voice_generation",
    discoveryEndpoint: "/v1/models",
    baseUrl: "https://api.sesame.com",
    envVarHint: "SESAME_API_KEY",
    models: [m("Sesame CSM", "Natural speech", "Campaigns")],
  },
  {
    providerId: "suno",
    displayName: "Suno",
    department: "music",
    discoveryEndpoint: "/v1/models",
    baseUrl: "https://api.suno.ai",
    envVarHint: "SUNO_API_KEY",
    models: [m("Suno v4", "Music generation", "Campaigns")],
  },
  {
    providerId: "udio",
    displayName: "Udio",
    department: "music",
    discoveryEndpoint: "/v1/models",
    baseUrl: "https://api.udio.com",
    envVarHint: "UDIO_API_KEY",
    models: [m("Udio", "Studio-quality music", "Campaigns")],
  },
  {
    providerId: "stability",
    displayName: "Stability AI",
    department: "audio",
    discoveryEndpoint: "/v2beta/models",
    baseUrl: "https://api.stability.ai",
    envVarHint: "STABILITY_API_KEY",
    models: [m("Stable Audio 2", "Background music & SFX", "Campaigns")],
  },
  {
    providerId: "tripo",
    displayName: "Tripo",
    department: "three_d",
    discoveryEndpoint: "/v2/models",
    baseUrl: "https://api.tripo3d.ai",
    envVarHint: "TRIPO_API_KEY",
    models: [m("Tripo AI", "Text-to-3D", "Campaigns")],
  },
  {
    providerId: "deemos",
    displayName: "Deemos",
    department: "three_d",
    discoveryEndpoint: "/v1/models",
    baseUrl: "https://api.deemos.com",
    envVarHint: "DEEMOS_API_KEY",
    models: [m("Rodin", "3D assets", "Campaigns")],
  },
  {
    providerId: "exa",
    displayName: "Exa",
    department: "research",
    discoveryEndpoint: "/search",
    baseUrl: "https://api.exa.ai",
    envVarHint: "EXA_API_KEY",
    models: [m("Exa Search API", "Semantic search", "Campaigns")],
  },
  {
    providerId: "tavily",
    displayName: "Tavily",
    department: "research",
    discoveryEndpoint: "/search",
    baseUrl: "https://api.tavily.com",
    envVarHint: "TAVILY_API_KEY",
    models: [m("Tavily AI", "AI-native search", "Campaigns")],
  },
];

export function listCatalogProviderIds(): readonly string[] {
  return PROVIDER_CATALOG_SEED.map((p) => p.providerId);
}

export function getCatalogEntry(providerId: string): CatalogProviderEntry | undefined {
  return PROVIDER_CATALOG_SEED.find((p) => p.providerId === providerId);
}

export function countCatalogModels(): number {
  return PROVIDER_CATALOG_SEED.reduce((n, p) => n + p.models.length, 0);
}
