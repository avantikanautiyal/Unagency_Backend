/**
 * Seed inventory — data-driven provider and model definitions.
 * Encodes AI model inventory as data; no provider-specific logic.
 */

import type { ProviderId } from "../../shared/identifiers";
import { asProviderId } from "../../shared/identifiers";
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
    defaultModelId: "claude-3-5-sonnet",
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
    defaultModelId: "gemini-2.0-flash",
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
    defaultModelId: "grok-2",
  },
];

export const SEED_MODELS: readonly SeedModelEntry[] = [
  // OpenAI
  seedText("openai", "gpt-4o", "GPT-4o", "2024-11", 128000, 16384, 2.5, 10, "medium", "frontier", ["general", "enterprise"]),
  seedText("openai", "gpt-4o-mini", "GPT-4o Mini", "2024-07", 128000, 16384, 0.15, 0.6, "low", "standard", ["general"]),
  seedReasoning("openai", "o1", "OpenAI o1", "2024-12", 200000, 100000, 15, 60, "high", "frontier", ["research", "coding"]),
  seedReasoning("openai", "o1-mini", "OpenAI o1 Mini", "2024-09", 128000, 65536, 3, 12, "medium", "premium", ["coding"]),
  seedEmbedding("openai", "text-embedding-3-large", "Embedding 3 Large", "2024-01", 8191, 0, 0.13, 0, "low", "premium", ["enterprise"]),
  seedImage("openai", "dall-e-3", "DALL·E 3", "2023-11", 0, 1, 0.04, 0, "high", "premium", ["creative"]),
  seedAudio("openai", "whisper-1", "Whisper", "2023-09", 0, 0, 0.006, 0, "medium", "standard", ["media"], true, false),
  seedAudio("openai", "tts-1", "TTS-1", "2023-11", 4096, 0, 0.015, 0, "medium", "standard", ["media"], false, true),
  // Anthropic
  seedText("anthropic", "claude-3-5-sonnet", "Claude 3.5 Sonnet", "2024-10", 200000, 8192, 3, 15, "medium", "frontier", ["general", "coding"], true),
  seedText("anthropic", "claude-3-opus", "Claude 3 Opus", "2024-02", 200000, 4096, 15, 75, "high", "frontier", ["research"]),
  seedText("anthropic", "claude-3-haiku", "Claude 3 Haiku", "2024-03", 200000, 4096, 0.25, 1.25, "ultra_low", "economy", ["general"]),
  // Gemini
  seedMultimodal("gemini", "gemini-2.0-flash", "Gemini 2.0 Flash", "2024-12", 1048576, 8192, 0.1, 0.4, "ultra_low", "premium", ["general", "research"]),
  seedMultimodal("gemini", "gemini-1.5-pro", "Gemini 1.5 Pro", "2024-05", 2097152, 8192, 1.25, 5, "medium", "frontier", ["enterprise"]),
  seedMultimodal("gemini", "gemini-1.5-flash", "Gemini 1.5 Flash", "2024-05", 1048576, 8192, 0.075, 0.3, "low", "standard", ["general"]),
  seedEmbedding("gemini", "text-embedding-004", "Text Embedding 004", "2024-03", 2048, 0, 0.00001, 0, "low", "standard", ["enterprise"]),
  // Groq
  seedText("groq", "llama-3.3-70b-versatile", "Llama 3.3 70B", "2024-12", 128000, 32768, 0.59, 0.79, "ultra_low", "premium", ["coding"]),
  seedText("groq", "mixtral-8x7b-32768", "Mixtral 8x7B", "2024-01", 32768, 32768, 0.24, 0.24, "ultra_low", "standard", ["general"]),
  // DeepSeek
  seedReasoning("deepseek", "deepseek-chat", "DeepSeek Chat", "2024-12", 64000, 8192, 0.14, 0.28, "low", "premium", ["coding"]),
  seedReasoning("deepseek", "deepseek-reasoner", "DeepSeek Reasoner", "2025-01", 64000, 8192, 0.55, 2.19, "medium", "frontier", ["research"]),
  // Mistral
  seedText("mistral", "mistral-large", "Mistral Large", "2024-11", 128000, 8192, 2, 6, "medium", "frontier", ["enterprise"]),
  seedText("mistral", "mistral-small", "Mistral Small", "2024-09", 32000, 8192, 0.2, 0.6, "low", "standard", ["general"]),
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
  seedMultimodal("xai", "grok-2", "Grok 2", "2024-12", 131072, 8192, 2, 10, "medium", "frontier", ["general", "research"]),
  seedText("xai", "grok-2-mini", "Grok 2 Mini", "2024-12", 131072, 8192, 0.5, 2, "low", "standard", ["general"]),
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
