/**
 * Seed inventory — data-driven provider and model definitions.
 * Encodes AI model inventory as data; no provider-specific logic.
 */

import type { ProviderId } from "../../core/identifiers";
import { asProviderId } from "../../core/identifiers";
import type {
  AvailabilityState,
  DepartmentKind,
  InputTypeKind,
  LatencyTier,
  ModalityKind,
  ModelLifecycleState,
  OutputTypeKind,
  QualityTier,
} from "../contracts/enums";
import type { ModelCapabilityFlags } from "../contracts/capabilities";

export interface SeedProviderEntry {
  readonly vendor: string;
  readonly displayName: string;
  readonly description: string;
  readonly departments: readonly DepartmentKind[];
  readonly modalities: readonly ModalityKind[];
  readonly regions: readonly string[];
  readonly lifecycleState: ModelLifecycleState;
  readonly capabilities: readonly string[];
  readonly defaultModelId: string;
}

export interface SeedModelEntry {
  readonly providerVendor: string;
  readonly modelId: string;
  readonly displayName: string;
  readonly version: string;
  readonly modalities: readonly ModalityKind[];
  readonly capabilities: readonly string[];
  readonly inputTypes: readonly InputTypeKind[];
  readonly outputTypes: readonly OutputTypeKind[];
  readonly flags: ModelCapabilityFlags;
  readonly maximumContext: number;
  readonly maximumOutput: number;
  readonly inputPer1k: number;
  readonly outputPer1k: number;
  readonly latencyTier: LatencyTier;
  readonly qualityTier: QualityTier;
  readonly availability: AvailabilityState;
  readonly regions: readonly string[];
  readonly lifecycleState: ModelLifecycleState;
  readonly departments: readonly DepartmentKind[];
  readonly aliases?: readonly string[];
}

export const SEED_PROVIDERS: readonly SeedProviderEntry[] = [
  {
    vendor: "openai",
    displayName: "OpenAI",
    description: "Frontier text, vision, audio, and image models",
    departments: ["general", "enterprise", "coding", "creative"],
    modalities: ["text", "image", "audio", "embedding", "multimodal"],
    regions: ["us-east-1", "eu-west-1"],
    lifecycleState: "active",
    capabilities: ["text.generate", "text.chat", "image.generate", "audio.transcribe", "audio.synthesize", "embedding.generate"],
    defaultModelId: "gpt-4o",
  },
  {
    vendor: "anthropic",
    displayName: "Anthropic",
    description: "Claude family of reasoning and multimodal models",
    departments: ["general", "enterprise", "research", "coding"],
    modalities: ["text", "multimodal"],
    regions: ["us-east-1", "eu-west-1"],
    lifecycleState: "active",
    capabilities: ["text.generate", "text.chat", "reasoning.analyze"],
    defaultModelId: "claude-sonnet-4-5",
  },
  {
    vendor: "gemini",
    displayName: "Google Gemini",
    description: "Gemini multimodal and embedding models",
    departments: ["general", "research", "enterprise"],
    modalities: ["text", "image", "audio", "embedding", "multimodal"],
    regions: ["us-central1", "europe-west1"],
    lifecycleState: "active",
    capabilities: ["text.generate", "text.chat", "embedding.generate", "vision.analyze"],
    defaultModelId: "gemini-3.6-flash",
  },
  {
    vendor: "groq",
    displayName: "Groq",
    description: "Ultra-low latency inference",
    departments: ["general", "coding"],
    modalities: ["text"],
    regions: ["us-east-1"],
    lifecycleState: "active",
    capabilities: ["text.generate", "text.chat"],
    defaultModelId: "llama-3.3-70b-versatile",
  },
  {
    vendor: "deepseek",
    displayName: "DeepSeek",
    description: "Reasoning-focused language models",
    departments: ["coding", "research"],
    modalities: ["text"],
    regions: ["ap-southeast-1"],
    lifecycleState: "active",
    capabilities: ["text.generate", "text.chat", "reasoning.analyze"],
    defaultModelId: "deepseek-chat",
  },
  {
    vendor: "mistral",
    displayName: "Mistral AI",
    description: "European open and commercial models",
    departments: ["general", "enterprise", "coding"],
    modalities: ["text", "embedding"],
    regions: ["eu-west-1"],
    lifecycleState: "active",
    capabilities: ["text.generate", "text.chat", "embedding.generate"],
    defaultModelId: "mistral-large",
  },
  {
    vendor: "openrouter",
    displayName: "OpenRouter",
    description: "Multi-provider model gateway",
    departments: ["general", "research"],
    modalities: ["text", "multimodal"],
    regions: ["global"],
    lifecycleState: "active",
    capabilities: ["text.generate", "text.chat"],
    defaultModelId: "openrouter/auto",
  },
  {
    vendor: "together",
    displayName: "Together AI",
    description: "Open model hosting",
    departments: ["research", "coding"],
    modalities: ["text", "embedding"],
    regions: ["us-west-2"],
    lifecycleState: "active",
    capabilities: ["text.generate", "text.chat", "embedding.generate"],
    defaultModelId: "meta-llama/Llama-3-70b-chat-hf",
  },
  {
    vendor: "fireworks",
    displayName: "Fireworks AI",
    description: "Fast open model inference",
    departments: ["coding", "research"],
    modalities: ["text", "embedding"],
    regions: ["us-west-2"],
    lifecycleState: "active",
    capabilities: ["text.generate", "text.chat", "embedding.generate"],
    defaultModelId: "accounts/fireworks/models/llama-v3p1-70b-instruct",
  },
  {
    vendor: "cohere",
    displayName: "Cohere",
    description: "Enterprise text and embedding models",
    departments: ["enterprise", "research"],
    modalities: ["text", "embedding"],
    regions: ["us-east-1", "ca-central-1"],
    lifecycleState: "active",
    capabilities: ["text.generate", "text.chat", "embedding.generate"],
    defaultModelId: "command-r-plus",
  },
  {
    vendor: "xai",
    displayName: "xAI",
    description: "Grok family models",
    departments: ["general", "research"],
    modalities: ["text", "multimodal"],
    regions: ["us-east-1"],
    lifecycleState: "active",
    capabilities: ["text.generate", "text.chat"],
    defaultModelId: "grok-4",
  },
  {
    vendor: "alibaba",
    displayName: "Alibaba",
    description: "Qwen multilingual reasoning models",
    departments: ["general", "research", "enterprise"],
    modalities: ["text"],
    regions: ["ap-southeast-1"],
    lifecycleState: "active",
    capabilities: ["text.generate", "text.chat", "reasoning.analyze"],
    defaultModelId: "qwen3-235b-a22b",
  },
  {
    vendor: "moonshot",
    displayName: "Moonshot AI",
    description: "Kimi long-context reasoning models",
    departments: ["general", "coding", "research"],
    modalities: ["text"],
    regions: ["ap-east-1"],
    lifecycleState: "active",
    capabilities: ["text.generate", "text.chat", "reasoning.analyze"],
    defaultModelId: "kimi-k2",
  },
  {
    vendor: "meta",
    displayName: "Meta",
    description: "Llama open-weight reasoning models",
    departments: ["general", "coding", "research"],
    modalities: ["text", "multimodal"],
    regions: ["us-east-1"],
    lifecycleState: "active",
    capabilities: ["text.generate", "text.chat", "reasoning.analyze"],
    defaultModelId: "Llama-4-Maverick-17B-128E-Instruct-FP8",
  },
  {
    vendor: "perplexity",
    displayName: "Perplexity",
    description: "Live web search and deep research models",
    departments: ["research"],
    modalities: ["text"],
    regions: ["global"],
    lifecycleState: "active",
    capabilities: ["text.generate", "text.chat", "research.web_search"],
    defaultModelId: "sonar",
  },
  {
    vendor: "runway",
    displayName: "Runway",
    description: "AI video generation for commercial filmmaking",
    departments: ["creative", "media"],
    modalities: ["video"],
    regions: ["global"],
    lifecycleState: "active",
    capabilities: ["video.generate"],
    defaultModelId: "runway-gen-4",
  },
  {
    vendor: "kling",
    displayName: "Kling AI",
    description: "Cinematic video generation",
    departments: ["creative", "media"],
    modalities: ["video"],
    regions: ["global"],
    lifecycleState: "active",
    capabilities: ["video.generate"],
    defaultModelId: "kling-2-1",
  },
  {
    vendor: "luma",
    displayName: "Luma AI",
    description: "Product and marketing video generation",
    departments: ["creative", "media"],
    regions: ["global"],
    lifecycleState: "active",
    modalities: ["video"],
    capabilities: ["video.generate"],
    defaultModelId: "luma-ray-2",
  },
  {
    vendor: "pika",
    displayName: "Pika",
    description: "Short-form video generation",
    departments: ["creative", "media"],
    modalities: ["video"],
    regions: ["global"],
    lifecycleState: "active",
    capabilities: ["video.generate"],
    defaultModelId: "pika-2-2",
  },
  {
    vendor: "minimax",
    displayName: "MiniMax",
    description: "Fast video generation (Hailuo)",
    departments: ["creative", "media"],
    modalities: ["video"],
    regions: ["global"],
    lifecycleState: "active",
    capabilities: ["video.generate"],
    defaultModelId: "hailuo-ai",
  },
  {
    vendor: "pixverse",
    displayName: "PixVerse",
    description: "Marketing video generation",
    departments: ["creative", "media"],
    modalities: ["video"],
    regions: ["global"],
    lifecycleState: "active",
    capabilities: ["video.generate"],
    defaultModelId: "pixverse-v4",
  },
  {
    vendor: "google",
    displayName: "Google",
    description: "Google Veo commercial video models and Imagen",
    departments: ["creative", "media", "enterprise"],
    modalities: ["video", "image"],
    regions: ["global"],
    lifecycleState: "active",
    capabilities: ["video.generate", "image.generate"],
    defaultModelId: "veo-3",
  },
  {
    vendor: "higgsfield",
    displayName: "Higgsfield",
    description: "Fashion and cinematic video ads",
    departments: ["creative", "media"],
    modalities: ["video"],
    regions: ["global"],
    lifecycleState: "active",
    capabilities: ["video.generate"],
    defaultModelId: "higgsfield-video",
  },
  {
    vendor: "heygen",
    displayName: "Heygen",
    description: "Avatar and marketing video generation",
    departments: ["creative", "media"],
    modalities: ["video"],
    regions: ["global"],
    lifecycleState: "active",
    capabilities: ["video.generate"],
    defaultModelId: "heygen",
  },
  {
    vendor: "seedance",
    displayName: "Seedance",
    description: "Marketing video generation",
    departments: ["creative", "media"],
    modalities: ["video"],
    regions: ["global"],
    lifecycleState: "active",
    capabilities: ["video.generate"],
    defaultModelId: "seedance-2",
  },
  {
    vendor: "wan",
    displayName: "Wan",
    description: "Marketing video generation",
    departments: ["creative", "media"],
    modalities: ["video"],
    regions: ["global"],
    lifecycleState: "active",
    capabilities: ["video.generate"],
    defaultModelId: "wan-2-5",
  },
  {
    vendor: "elevenlabs",
    displayName: "ElevenLabs",
    description: "Neural voice synthesis and TTS",
    departments: ["media", "creative"],
    modalities: ["audio"],
    regions: ["global"],
    lifecycleState: "active",
    capabilities: ["audio.synthesize"],
    defaultModelId: "eleven-turbo-v2-5",
  },
  {
    vendor: "cartesia",
    displayName: "Cartesia",
    description: "Real-time neural TTS",
    departments: ["media", "enterprise"],
    modalities: ["audio"],
    regions: ["global"],
    lifecycleState: "active",
    capabilities: ["audio.synthesize"],
    defaultModelId: "sonic-2",
  },
  {
    vendor: "ideogram",
    displayName: "Ideogram",
    description: "Typography and poster image generation",
    departments: ["creative", "media"],
    modalities: ["image"],
    regions: ["global"],
    lifecycleState: "active",
    capabilities: ["image.generate"],
    defaultModelId: "ideogram-3",
  },
  {
    vendor: "recraft",
    displayName: "Recraft",
    description: "Logo and vector image generation",
    departments: ["creative", "media"],
    modalities: ["image"],
    regions: ["global"],
    lifecycleState: "active",
    capabilities: ["image.generate"],
    defaultModelId: "recraft-v3",
  },
  {
    vendor: "midjourney",
    displayName: "Midjourney",
    description: "Artistic marketing visuals",
    departments: ["creative", "media"],
    modalities: ["image"],
    regions: ["global"],
    lifecycleState: "active",
    capabilities: ["image.generate"],
    defaultModelId: "midjourney-v7",
  },
  {
    vendor: "hidream",
    displayName: "HiDream",
    description: "Commercial imagery",
    departments: ["creative", "media"],
    modalities: ["image"],
    regions: ["global"],
    lifecycleState: "active",
    capabilities: ["image.generate"],
    defaultModelId: "hidream-i1",
  },
  {
    vendor: "reve",
    displayName: "Reve AI",
    description: "Product visualization imagery",
    departments: ["creative", "media"],
    modalities: ["image"],
    regions: ["global"],
    lifecycleState: "active",
    capabilities: ["image.generate"],
    defaultModelId: "reve-image",
  },
  {
    vendor: "picsart",
    displayName: "Picsart",
    description: "Product visualization imagery",
    departments: ["creative", "media"],
    modalities: ["image"],
    regions: ["global"],
    lifecycleState: "active",
    capabilities: ["image.generate"],
    defaultModelId: "picsart",
  },
  {
    vendor: "freepik",
    displayName: "Freepik",
    description: "Brand imagery and creative assets",
    departments: ["creative", "media"],
    modalities: ["image"],
    regions: ["global"],
    lifecycleState: "active",
    capabilities: ["image.generate"],
    defaultModelId: "freepik",
  },
  {
    vendor: "exa",
    displayName: "Exa",
    description: "Semantic web search for campaigns research",
    departments: ["research"],
    modalities: ["text"],
    regions: ["global"],
    lifecycleState: "active",
    capabilities: ["research.web_search"],
    defaultModelId: "exa-search",
  },
  {
    vendor: "tavily",
    displayName: "Tavily",
    description: "AI-native web search",
    departments: ["research"],
    modalities: ["text"],
    regions: ["global"],
    lifecycleState: "active",
    capabilities: ["research.web_search"],
    defaultModelId: "tavily-search",
  },
];

export const SEED_MODELS: readonly SeedModelEntry[] = [
  // OpenAI
  seedText("openai", "gpt-4o", "GPT-4o", "2024-11", 128000, 16384, 2.5, 10, "medium", "frontier", ["general", "enterprise"]),
  seedText("openai", "gpt-4o-mini", "GPT-4o Mini", "2024-07", 128000, 16384, 0.15, 0.6, "low", "standard", ["general"]),
  seedText("openai", "gpt-5.5", "GPT-5.5", "2025-08", 256000, 32768, 5, 15, "medium", "frontier", ["general", "enterprise", "coding"]),
  seedReasoning("openai", "o1", "OpenAI o1", "2024-12", 200000, 100000, 15, 60, "high", "frontier", ["research", "coding"]),
  seedReasoning("openai", "o1-mini", "OpenAI o1 Mini", "2024-09", 128000, 65536, 3, 12, "medium", "premium", ["coding"]),
  seedReasoning("openai", "codex", "Codex", "2025-01", 128000, 32768, 3, 12, "medium", "frontier", ["coding"]),
  seedEmbedding("openai", "text-embedding-3-large", "Embedding 3 Large", "2024-01", 8191, 0, 0.13, 0, "low", "premium", ["enterprise"]),
  seedImage("openai", "dall-e-3", "DALL·E 3 (legacy)", "2023-11", 0, 1, 0.04, 0, "high", "premium", ["creative"]),
  seedImage("openai", "gpt-image-1", "GPT Image", "2025-01", 0, 1, 0.04, 0, "high", "frontier", ["creative"]),
  seedImage("openai", "gpt-image-1.5", "GPT Image 1.5", "2025-06", 0, 1, 0.04, 0, "high", "frontier", ["creative"]),
  seedImage("openai", "gpt-image-2", "GPT Image 2", "2026-04", 0, 1, 0.04, 0, "high", "frontier", ["creative"]),
  seedAudio("openai", "whisper-1", "Whisper", "2023-09", 0, 0, 0.006, 0, "medium", "standard", ["media"], true, false),
  seedAudio("openai", "tts-1", "GPT Voice", "2023-11", 4096, 0, 0.015, 0, "medium", "standard", ["media"], false, true),
  // Anthropic — inventory ids remap to live wire models in the Anthropic adapter.
  seedText("anthropic", "claude-sonnet-4-5", "Claude Sonnet 4.5", "2025-09", 200000, 16384, 3, 15, "medium", "frontier", ["general", "coding"], true),
  seedText("anthropic", "claude-sonnet-4-6", "Claude Sonnet 4.6", "2026-01", 200000, 16384, 3, 15, "medium", "frontier", ["general", "coding"], true),
  seedText("anthropic", "claude-3-5-sonnet", "Claude 3.5 Sonnet (alias→4.5)", "2024-10", 200000, 8192, 3, 15, "medium", "frontier", ["general", "coding"], true),
  seedText("anthropic", "claude-sonnet-4", "Claude Sonnet 4 (alias→4.6)", "2025-05", 200000, 16384, 3, 15, "medium", "frontier", ["general", "coding"], true),
  seedText("anthropic", "claude-opus-4-6", "Claude Opus 4.6", "2026-01", 200000, 32768, 15, 75, "high", "frontier", ["research"]),
  seedText("anthropic", "claude-opus-4-5", "Claude Opus 4.5", "2025-11", 200000, 32768, 15, 75, "high", "frontier", ["research"]),
  seedText("anthropic", "claude-opus-4-1", "Claude Opus 4.1 (alias→4.6)", "2025-08", 200000, 32768, 15, 75, "high", "frontier", ["research"]),
  seedText("anthropic", "claude-3-opus", "Claude 3 Opus (alias→4.5)", "2024-02", 200000, 4096, 15, 75, "high", "frontier", ["research"]),
  seedText("anthropic", "claude-haiku-4-5", "Claude Haiku 4.5", "2025-10", 200000, 8192, 0.25, 1.25, "ultra_low", "economy", ["general"]),
  seedText("anthropic", "claude-3-haiku", "Claude 3 Haiku (alias→4.5)", "2024-03", 200000, 4096, 0.25, 1.25, "ultra_low", "economy", ["general"]),
  // Gemini — current Generative Language API ids (2.5-* retired for new keys).
  seedMultimodal("gemini", "gemini-3.6-flash", "Gemini 3.6 Flash", "2026-03", 1048576, 8192, 0.1, 0.4, "ultra_low", "premium", ["general", "coding", "research"]),
  seedMultimodal("gemini", "gemini-3.5-flash", "Gemini 3.5 Flash", "2026-02", 1048576, 8192, 0.1, 0.4, "ultra_low", "premium", ["general", "coding"]),
  seedMultimodal("gemini", "gemini-3.5-flash-lite", "Gemini 3.5 Flash Lite", "2026-02", 1048576, 8192, 0.05, 0.2, "ultra_low", "standard", ["general"]),
  seedMultimodal("gemini", "gemini-flash-latest", "Gemini Flash Latest", "2026-03", 1048576, 8192, 0.1, 0.4, "ultra_low", "premium", ["general", "coding"]),
  seedMultimodal("gemini", "gemini-pro-latest", "Gemini Pro Latest", "2026-03", 1048576, 16384, 1.25, 5, "medium", "frontier", ["enterprise", "research", "coding"]),
  seedMultimodal("gemini", "gemini-2.5-flash", "Gemini 2.5 Flash (alias→3.6)", "2025-05", 1048576, 8192, 0.1, 0.4, "ultra_low", "premium", ["general", "research"]),
  seedMultimodal("gemini", "gemini-2.0-flash-001", "Gemini 2.0 Flash 001", "2025-02", 1048576, 8192, 0.1, 0.4, "ultra_low", "premium", ["general", "research"]),
  seedMultimodal("gemini", "gemini-2.0-flash", "Gemini 2.0 Flash", "2024-12", 1048576, 8192, 0.1, 0.4, "ultra_low", "premium", ["general", "research"]),
  seedMultimodal("gemini", "gemini-2.5-pro", "Gemini 2.5 Pro (alias→pro-latest)", "2025-05", 1048576, 16384, 1.25, 5, "medium", "frontier", ["enterprise", "research"]),
  seedMultimodal("gemini", "gemini-flash", "Gemini Flash", "2025-05", 1048576, 8192, 0.075, 0.3, "ultra_low", "standard", ["general"]),
  seedMultimodal("gemini", "gemini-1.5-pro", "Gemini 1.5 Pro", "2024-05", 2097152, 8192, 1.25, 5, "medium", "frontier", ["enterprise"]),
  seedMultimodal("gemini", "gemini-1.5-flash", "Gemini 1.5 Flash", "2024-05", 1048576, 8192, 0.075, 0.3, "low", "standard", ["general"]),
  seedEmbedding("gemini", "text-embedding-004", "Text Embedding 004", "2024-03", 2048, 0, 0.00001, 0, "low", "standard", ["enterprise"]),
  // Groq
  seedText("groq", "llama-3.3-70b-versatile", "Llama 3.3 70B", "2024-12", 128000, 32768, 0.59, 0.79, "ultra_low", "premium", ["coding"]),
  seedText("groq", "mixtral-8x7b-32768", "Mixtral 8x7B", "2024-01", 32768, 32768, 0.24, 0.24, "ultra_low", "standard", ["general"]),
  // DeepSeek
  seedReasoning("deepseek", "deepseek-chat", "DeepSeek Chat", "2024-12", 64000, 8192, 0.14, 0.28, "low", "premium", ["coding"]),
  seedReasoning("deepseek", "deepseek-reasoner", "DeepSeek R1", "2025-01", 64000, 8192, 0.55, 2.19, "medium", "frontier", ["research"]),
  // Mistral
  seedText("mistral", "mistral-large", "Mistral Large", "2024-11", 128000, 8192, 2, 6, "medium", "frontier", ["enterprise"]),
  seedText("mistral", "mistral-small", "Mistral Small", "2024-09", 32000, 8192, 0.2, 0.6, "low", "standard", ["general"]),
  seedReasoning("mistral", "magistral-medium", "Magistral", "2025-06", 128000, 8192, 2, 6, "medium", "frontier", ["research"]),
  seedEmbedding("mistral", "mistral-embed", "Mistral Embed", "2024-03", 8192, 0, 0.1, 0, "low", "standard", ["enterprise"]),
  // OpenRouter
  seedText("openrouter", "openrouter/auto", "OpenRouter Auto", "2024-01", 128000, 8192, 0, 0, "medium", "standard", ["general"]),
  // Together
  seedText("together", "meta-llama/Llama-3-70b-chat-hf", "Llama 3 70B Chat", "2024-04", 8192, 4096, 0.88, 0.88, "low", "premium", ["research"]),
  // Fireworks
  seedText("fireworks", "accounts/fireworks/models/llama-v3p1-70b-instruct", "Llama 3.1 70B Instruct", "2024-07", 131072, 16384, 0.9, 0.9, "ultra_low", "premium", ["coding"]),
  // Cohere
  seedText("cohere", "command-r-plus", "Command R+", "2024-04", 128000, 4096, 3, 15, "medium", "frontier", ["enterprise"]),
  seedEmbedding("cohere", "embed-english-v3.0", "Embed English v3", "2024-01", 512, 0, 0.1, 0, "low", "standard", ["enterprise"]),
  // xAI
  seedMultimodal("xai", "grok-4", "Grok 4", "2025-07", 256000, 16384, 3, 15, "medium", "frontier", ["general", "research"]),
  seedMultimodal("xai", "grok-2", "Grok 2", "2024-12", 131072, 8192, 2, 10, "medium", "frontier", ["general", "research"]),
  seedText("xai", "grok-2-mini", "Grok 2 Mini", "2024-12", 131072, 8192, 0.5, 2, "low", "standard", ["general"]),
  // Alibaba / Moonshot / Meta / Perplexity
  seedReasoning("alibaba", "qwen3-235b-a22b", "Qwen 3 235B", "2025-05", 128000, 16384, 0.7, 2.8, "medium", "frontier", ["research", "enterprise"]),
  seedText("alibaba", "qwen-plus", "Qwen Plus", "2025-01", 128000, 8192, 0.4, 1.2, "low", "premium", ["general"]),
  seedReasoning("moonshot", "kimi-k2", "Kimi K2", "2025-07", 200000, 16384, 1, 3, "medium", "frontier", ["coding", "research"]),
  seedText("moonshot", "moonshot-v1-128k", "Moonshot 128K", "2024-10", 128000, 8192, 0.6, 1.8, "low", "premium", ["general"]),
  seedReasoning("meta", "Llama-4-Maverick-17B-128E-Instruct-FP8", "Llama 4 Maverick", "2025-04", 128000, 8192, 0.5, 1.5, "medium", "frontier", ["general", "coding"]),
  seedText("meta", "Llama-4-Scout-17B-16E-Instruct", "Llama 4 Scout", "2025-04", 128000, 8192, 0.2, 0.6, "low", "premium", ["general"]),
  seedText("perplexity", "sonar", "Perplexity Sonar", "2025-01", 127000, 8192, 1, 1, "low", "premium", ["research"]),
  seedText("perplexity", "sonar-pro", "Perplexity Sonar Pro", "2025-01", 200000, 8192, 3, 15, "medium", "frontier", ["research"]),
  seedReasoning("perplexity", "sonar-deep-research", "Perplexity Sonar Deep Research", "2025-02", 200000, 16384, 5, 20, "high", "frontier", ["research"]),
  // Video — M9.5E catalog-backed inventory (provider-catalog-seed bootstrap labels)
  seedVideo("runway", "runway-gen-4", "Runway Gen-4", "2025-01", ["creative"]),
  seedVideo("kling", "kling-2-1", "Kling 2.1", "2025-01", ["creative"]),
  seedVideo("luma", "luma-ray-2", "Luma Ray 2", "2025-01", ["creative"]),
  seedVideo("pika", "pika-2-2", "Pika 2.2", "2025-01", ["creative"]),
  seedVideo("minimax", "hailuo-ai", "Hailuo AI", "2025-01", ["creative"]),
  seedVideo("pixverse", "pixverse-v4", "PixVerse V4", "2025-01", ["creative"]),
  seedVideo("google", "veo-3", "Veo 3", "2025-01", ["creative", "enterprise"]),
  seedImage("google", "gemini-2.5-flash-image", "Gemini 2.5 Flash Image", "2025-05", 0, 1, 0.04, 0, "high", "frontier", ["creative"]),
  seedImage("google", "gemini-3-pro-image", "Gemini 3 Pro Image", "2025-11", 0, 1, 0.08, 0, "high", "frontier", ["creative"]),
  seedImage("google", "imagen-4", "Imagen 4 (maps to Gemini Pro Image)", "2025-01", 0, 1, 0.04, 0, "high", "frontier", ["creative"]),
  seedVideo("higgsfield", "higgsfield-video", "Higgsfield Video", "2025-01", ["creative"]),
  seedVideo("heygen", "heygen", "Heygen", "2025-01", ["creative"]),
  seedVideo("seedance", "seedance-2", "Seedance 2", "2025-01", ["creative"]),
  seedVideo("wan", "wan-2-5", "Wan 2.5", "2025-01", ["creative"]),
  seedAudio("elevenlabs", "eleven-turbo-v2-5", "Eleven Turbo v2.5", "2025-01", 5000, 0, 0.03, 0, "low", "premium", ["media"], false, true),
  seedAudio("cartesia", "sonic-2", "Cartesia Sonic 2", "2025-01", 5000, 0, 0.02, 0, "ultra_low", "premium", ["media"], false, true),
  // Image vendors
  seedImage("ideogram", "ideogram-3", "Ideogram 3", "2025-01", 0, 1, 0.04, 0, "high", "premium", ["creative"]),
  seedImage("recraft", "recraft-v3", "Recraft V3", "2025-01", 0, 1, 0.04, 0, "high", "premium", ["creative"]),
  seedImage("midjourney", "midjourney-v7", "Midjourney V7", "2025-01", 0, 1, 0.04, 0, "high", "frontier", ["creative"]),
  seedImage("hidream", "hidream-i1", "HiDream-I1", "2025-01", 0, 1, 0.04, 0, "high", "premium", ["creative"]),
  seedImage("reve", "reve-image", "Reve Image", "2025-01", 0, 1, 0.04, 0, "high", "premium", ["creative"]),
  seedImage("picsart", "picsart", "Picsart", "2025-01", 0, 1, 0.04, 0, "medium", "standard", ["creative"]),
  seedImage("freepik", "freepik", "Freepik", "2025-01", 0, 1, 0.04, 0, "medium", "standard", ["creative"]),
  // Research search
  seedResearch("exa", "exa-search", "Exa Search API", "2025-01", ["research"]),
  seedResearch("tavily", "tavily-search", "Tavily AI", "2025-01", ["research"]),
];

export function providerIdForVendor(vendor: string): ProviderId {
  return asProviderId(`provider.${vendor}`);
}

function baseFlags(overrides: Partial<ModelCapabilityFlags> = {}): ModelCapabilityFlags {
  return {
    streaming: true,
    functionCalling: true,
    structuredOutput: true,
    reasoning: false,
    vision: false,
    imageGeneration: false,
    videoGeneration: false,
    audioInput: false,
    audioOutput: false,
    embeddings: false,
    ...overrides,
  };
}

function seedText(
  vendor: string,
  modelId: string,
  displayName: string,
  version: string,
  ctx: number,
  out: number,
  inputPer1k: number,
  outputPer1k: number,
  latency: LatencyTier,
  quality: QualityTier,
  departments: readonly DepartmentKind[],
  vision = false
): SeedModelEntry {
  return {
    providerVendor: vendor,
    modelId,
    displayName,
    version,
    modalities: vision ? ["text", "multimodal"] : ["text"],
    capabilities: vision
      ? ["text.generate", "text.chat", "vision.analyze"]
      : ["text.generate", "text.chat"],
    inputTypes: vision ? ["text", "image"] : ["text"],
    outputTypes: ["text"],
    flags: baseFlags({ vision }),
    maximumContext: ctx,
    maximumOutput: out,
    inputPer1k,
    outputPer1k,
    latencyTier: latency,
    qualityTier: quality,
    availability: "available",
    regions: SEED_PROVIDERS.find((p) => p.vendor === vendor)?.regions ?? ["global"],
    lifecycleState: "active",
    departments,
  };
}

function seedReasoning(
  vendor: string,
  modelId: string,
  displayName: string,
  version: string,
  ctx: number,
  out: number,
  inputPer1k: number,
  outputPer1k: number,
  latency: LatencyTier,
  quality: QualityTier,
  departments: readonly DepartmentKind[]
): SeedModelEntry {
  const entry = seedText(vendor, modelId, displayName, version, ctx, out, inputPer1k, outputPer1k, latency, quality, departments);
  return {
    ...entry,
    capabilities: [...entry.capabilities, "reasoning.analyze"],
    flags: baseFlags({ reasoning: true }),
  };
}

function seedMultimodal(
  vendor: string,
  modelId: string,
  displayName: string,
  version: string,
  ctx: number,
  out: number,
  inputPer1k: number,
  outputPer1k: number,
  latency: LatencyTier,
  quality: QualityTier,
  departments: readonly DepartmentKind[]
): SeedModelEntry {
  return {
    providerVendor: vendor,
    modelId,
    displayName,
    version,
    modalities: ["text", "multimodal"],
    capabilities: ["text.generate", "text.chat", "vision.analyze"],
    inputTypes: ["text", "image"],
    outputTypes: ["text"],
    flags: baseFlags({ vision: true }),
    maximumContext: ctx,
    maximumOutput: out,
    inputPer1k,
    outputPer1k,
    latencyTier: latency,
    qualityTier: quality,
    availability: "available",
    regions: SEED_PROVIDERS.find((p) => p.vendor === vendor)?.regions ?? ["global"],
    lifecycleState: "active",
    departments,
  };
}

function seedEmbedding(
  vendor: string,
  modelId: string,
  displayName: string,
  version: string,
  ctx: number,
  out: number,
  inputPer1k: number,
  outputPer1k: number,
  latency: LatencyTier,
  quality: QualityTier,
  departments: readonly DepartmentKind[]
): SeedModelEntry {
  return {
    providerVendor: vendor,
    modelId,
    displayName,
    version,
    modalities: ["embedding"],
    capabilities: ["embedding.generate"],
    inputTypes: ["text"],
    outputTypes: ["embedding"],
    flags: baseFlags({ embeddings: true, functionCalling: false, structuredOutput: false }),
    maximumContext: ctx,
    maximumOutput: out,
    inputPer1k,
    outputPer1k,
    latencyTier: latency,
    qualityTier: quality,
    availability: "available",
    regions: SEED_PROVIDERS.find((p) => p.vendor === vendor)?.regions ?? ["global"],
    lifecycleState: "active",
    departments,
  };
}

function seedImage(
  vendor: string,
  modelId: string,
  displayName: string,
  version: string,
  ctx: number,
  out: number,
  inputPer1k: number,
  outputPer1k: number,
  latency: LatencyTier,
  quality: QualityTier,
  departments: readonly DepartmentKind[]
): SeedModelEntry {
  return {
    providerVendor: vendor,
    modelId,
    displayName,
    version,
    modalities: ["image"],
    capabilities: ["image.generate"],
    inputTypes: ["text"],
    outputTypes: ["image"],
    flags: baseFlags({ imageGeneration: true, functionCalling: false }),
    maximumContext: ctx,
    maximumOutput: out,
    inputPer1k,
    outputPer1k,
    latencyTier: latency,
    qualityTier: quality,
    availability: "available",
    regions: SEED_PROVIDERS.find((p) => p.vendor === vendor)?.regions ?? ["global"],
    lifecycleState: "active",
    departments,
  };
}

function seedAudio(
  vendor: string,
  modelId: string,
  displayName: string,
  version: string,
  ctx: number,
  out: number,
  inputPer1k: number,
  outputPer1k: number,
  latency: LatencyTier,
  quality: QualityTier,
  departments: readonly DepartmentKind[],
  audioInput: boolean,
  audioOutput: boolean
): SeedModelEntry {
  return {
    providerVendor: vendor,
    modelId,
    displayName,
    version,
    modalities: ["audio"],
    capabilities: audioInput ? ["audio.transcribe"] : ["audio.synthesize"],
    inputTypes: audioInput ? ["audio"] : ["text"],
    outputTypes: audioOutput ? ["audio"] : ["text"],
    flags: baseFlags({ audioInput, audioOutput, functionCalling: false }),
    maximumContext: ctx,
    maximumOutput: out,
    inputPer1k,
    outputPer1k,
    latencyTier: latency,
    qualityTier: quality,
    availability: "available",
    regions: SEED_PROVIDERS.find((p) => p.vendor === vendor)?.regions ?? ["global"],
    lifecycleState: "active",
    departments,
  };
}

function seedVideo(
  vendor: string,
  modelId: string,
  displayName: string,
  version: string,
  departments: readonly DepartmentKind[]
): SeedModelEntry {
  return {
    providerVendor: vendor,
    modelId,
    displayName,
    version,
    modalities: ["video"],
    capabilities: ["video.generate"],
    inputTypes: ["text", "image"],
    outputTypes: ["video"],
    flags: baseFlags({
      videoGeneration: true,
      functionCalling: false,
      structuredOutput: false,
      streaming: false,
    }),
    maximumContext: 0,
    maximumOutput: 1,
    inputPer1k: 0,
    outputPer1k: 0,
    latencyTier: "high",
    qualityTier: "premium",
    availability: "available",
    regions: SEED_PROVIDERS.find((p) => p.vendor === vendor)?.regions ?? ["global"],
    lifecycleState: "active",
    departments,
  };
}

function seedResearch(
  vendor: string,
  modelId: string,
  displayName: string,
  version: string,
  departments: readonly DepartmentKind[]
): SeedModelEntry {
  return {
    providerVendor: vendor,
    modelId,
    displayName,
    version,
    modalities: ["text"],
    capabilities: ["research.web_search"],
    inputTypes: ["text"],
    outputTypes: ["text"],
    flags: baseFlags({
      functionCalling: false,
      structuredOutput: false,
      streaming: false,
    }),
    maximumContext: 0,
    maximumOutput: 1,
    inputPer1k: 0,
    outputPer1k: 0,
    latencyTier: "low",
    qualityTier: "premium",
    availability: "available",
    regions: SEED_PROVIDERS.find((p) => p.vendor === vendor)?.regions ?? ["global"],
    lifecycleState: "active",
    departments,
  };
}
