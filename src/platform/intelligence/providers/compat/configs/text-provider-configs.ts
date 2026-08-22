/**
 * Text provider configs — OpenAI-compatible vendors from model registry seed.
 */

import type { TextProviderConfig } from "../contracts/text-provider-config";

const V = "1.0.0";

export const GROQ_CONFIG: TextProviderConfig = {
  vendor: "groq",
  canonicalProviderId: "provider.groq",
  wireProviderId: "groq",
  adapterId: "adapter.groq.text",
  sdkClientId: "sdk.groq.text",
  version: V,
  baseUrl: "https://api.groq.com/openai/v1",
  credentialEnvVar: "GROQ_API_KEY",
  enableEnvVar: "GROQ_ENABLED",
  seedWireModels: ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"],
  protocol: "openai_compatible",
  streamingCapable: true,
  toolsCapable: true,
  structuredOutputCapable: true,
};

export const DEEPSEEK_CONFIG: TextProviderConfig = {
  vendor: "deepseek",
  canonicalProviderId: "provider.deepseek",
  wireProviderId: "deepseek",
  adapterId: "adapter.deepseek.text",
  sdkClientId: "sdk.deepseek.text",
  version: V,
  baseUrl: "https://api.deepseek.com/v1",
  credentialEnvVar: "DEEPSEEK_API_KEY",
  enableEnvVar: "DEEPSEEK_ENABLED",
  seedWireModels: ["deepseek-chat", "deepseek-reasoner"],
  protocol: "openai_compatible",
  streamingCapable: true,
  toolsCapable: true,
  structuredOutputCapable: true,
};

export const MISTRAL_CONFIG: TextProviderConfig = {
  vendor: "mistral",
  canonicalProviderId: "provider.mistral",
  wireProviderId: "mistral",
  adapterId: "adapter.mistral.text",
  sdkClientId: "sdk.mistral.text",
  version: V,
  baseUrl: "https://api.mistral.ai/v1",
  credentialEnvVar: "MISTRAL_API_KEY",
  enableEnvVar: "MISTRAL_ENABLED",
  seedWireModels: ["mistral-large", "mistral-small", "magistral-medium", "mistral-embed"],
  protocol: "openai_compatible",
  streamingCapable: true,
  toolsCapable: true,
  structuredOutputCapable: true,
};

export const TOGETHER_CONFIG: TextProviderConfig = {
  vendor: "together",
  canonicalProviderId: "provider.together",
  wireProviderId: "together",
  adapterId: "adapter.together.text",
  sdkClientId: "sdk.together.text",
  version: V,
  baseUrl: "https://api.together.xyz/v1",
  credentialEnvVar: "TOGETHER_API_KEY",
  enableEnvVar: "TOGETHER_ENABLED",
  seedWireModels: ["meta-llama/Llama-3-70b-chat-hf"],
  protocol: "openai_compatible",
  streamingCapable: true,
  toolsCapable: true,
  structuredOutputCapable: true,
};

export const FIREWORKS_CONFIG: TextProviderConfig = {
  vendor: "fireworks",
  canonicalProviderId: "provider.fireworks",
  wireProviderId: "fireworks",
  adapterId: "adapter.fireworks.text",
  sdkClientId: "sdk.fireworks.text",
  version: V,
  baseUrl: "https://api.fireworks.ai/inference/v1",
  credentialEnvVar: "FIREWORKS_API_KEY",
  enableEnvVar: "FIREWORKS_ENABLED",
  seedWireModels: ["accounts/fireworks/models/llama-v3p1-70b-instruct"],
  protocol: "openai_compatible",
  streamingCapable: true,
  toolsCapable: true,
  structuredOutputCapable: true,
};

export const OPENROUTER_CONFIG: TextProviderConfig = {
  vendor: "openrouter",
  canonicalProviderId: "provider.openrouter",
  wireProviderId: "openrouter",
  adapterId: "adapter.openrouter.text",
  sdkClientId: "sdk.openrouter.text",
  version: V,
  baseUrl: "https://openrouter.ai/api/v1",
  credentialEnvVar: "OPENROUTER_API_KEY",
  enableEnvVar: "OPENROUTER_ENABLED",
  seedWireModels: ["openrouter/auto"],
  protocol: "openai_compatible",
  streamingCapable: true,
  toolsCapable: true,
  structuredOutputCapable: true,
};

export const XAI_CONFIG: TextProviderConfig = {
  vendor: "xai",
  canonicalProviderId: "provider.xai",
  wireProviderId: "xai",
  adapterId: "adapter.xai.text",
  sdkClientId: "sdk.xai.text",
  version: V,
  baseUrl: "https://api.x.ai/v1",
  credentialEnvVar: "XAI_API_KEY",
  enableEnvVar: "XAI_ENABLED",
  seedWireModels: ["grok-4", "grok-2", "grok-2-mini"],
  protocol: "openai_compatible",
  streamingCapable: true,
  toolsCapable: true,
  structuredOutputCapable: true,
};

export const ALIBABA_CONFIG: TextProviderConfig = {
  vendor: "alibaba",
  canonicalProviderId: "provider.alibaba",
  wireProviderId: "alibaba",
  adapterId: "adapter.alibaba.text",
  sdkClientId: "sdk.alibaba.text",
  version: V,
  baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  credentialEnvVar: "ALIBABA_API_KEY",
  enableEnvVar: "ALIBABA_ENABLED",
  seedWireModels: ["qwen3-235b-a22b", "qwen-plus"],
  protocol: "openai_compatible",
  streamingCapable: true,
  toolsCapable: true,
  structuredOutputCapable: true,
};

export const MOONSHOT_CONFIG: TextProviderConfig = {
  vendor: "moonshot",
  canonicalProviderId: "provider.moonshot",
  wireProviderId: "moonshot",
  adapterId: "adapter.moonshot.text",
  sdkClientId: "sdk.moonshot.text",
  version: V,
  baseUrl: "https://api.moonshot.cn/v1",
  credentialEnvVar: "MOONSHOT_API_KEY",
  enableEnvVar: "MOONSHOT_ENABLED",
  seedWireModels: ["kimi-k2", "moonshot-v1-128k"],
  protocol: "openai_compatible",
  streamingCapable: true,
  toolsCapable: true,
  structuredOutputCapable: true,
};

export const META_CONFIG: TextProviderConfig = {
  vendor: "meta",
  canonicalProviderId: "provider.meta",
  wireProviderId: "meta",
  adapterId: "adapter.meta.text",
  sdkClientId: "sdk.meta.text",
  version: V,
  baseUrl: "https://api.llama.meta.com/compat/v1",
  credentialEnvVar: "META_API_KEY",
  enableEnvVar: "META_ENABLED",
  seedWireModels: [
    "Llama-4-Maverick-17B-128E-Instruct-FP8",
    "Llama-4-Scout-17B-16E-Instruct",
  ],
  protocol: "openai_compatible",
  streamingCapable: true,
  toolsCapable: true,
  structuredOutputCapable: true,
};

export const PERPLEXITY_CONFIG: TextProviderConfig = {
  vendor: "perplexity",
  canonicalProviderId: "provider.perplexity",
  wireProviderId: "perplexity",
  adapterId: "adapter.perplexity.text",
  sdkClientId: "sdk.perplexity.text",
  version: V,
  baseUrl: "https://api.perplexity.ai",
  credentialEnvVar: "PERPLEXITY_API_KEY",
  enableEnvVar: "PERPLEXITY_ENABLED",
  seedWireModels: ["sonar", "sonar-pro", "sonar-deep-research"],
  protocol: "openai_compatible",
  streamingCapable: true,
  toolsCapable: false,
  structuredOutputCapable: false,
};

export const COMPAT_TEXT_PROVIDER_CONFIGS: readonly TextProviderConfig[] = [
  GROQ_CONFIG,
  DEEPSEEK_CONFIG,
  MISTRAL_CONFIG,
  TOGETHER_CONFIG,
  FIREWORKS_CONFIG,
  OPENROUTER_CONFIG,
  XAI_CONFIG,
  ALIBABA_CONFIG,
  MOONSHOT_CONFIG,
  META_CONFIG,
  PERPLEXITY_CONFIG,
];

export function compatConfigByVendor(vendor: string): TextProviderConfig | undefined {
  return COMPAT_TEXT_PROVIDER_CONFIGS.find((c) => c.vendor === vendor);
}

export function compatConfigByProviderId(providerId: string): TextProviderConfig | undefined {
  return COMPAT_TEXT_PROVIDER_CONFIGS.find((c) => c.canonicalProviderId === providerId);
}
