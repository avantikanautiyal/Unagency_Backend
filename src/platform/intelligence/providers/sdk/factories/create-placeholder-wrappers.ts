/**
 * Placeholder SDK wrapper factory.
 *
 * Purpose: Create all vendor placeholder wrappers with consistent defaults.
 * Responsibilities: One factory function per vendor + registerAll helper.
 * Usage: Called by createSdkPlatform.
 * Future Extension: Config-driven wrapper creation.
 */

import type { SdkVendor } from "../contracts/enums";
import { asSdkClientId } from "../contracts/identifiers";
import type { SdkVersion } from "../contracts/version";
import type { IProviderSdkClient } from "../interfaces/client";
import { OpenAISdkWrapper } from "../openai/openai-sdk-wrapper";
import { AnthropicSdkWrapper } from "../anthropic/anthropic-sdk-wrapper";
import { GeminiSdkWrapper } from "../gemini/gemini-sdk-wrapper";
import { GroqSdkWrapper } from "../groq/groq-sdk-wrapper";
import { DeepSeekSdkWrapper } from "../deepseek/deepseek-sdk-wrapper";
import { MistralSdkWrapper } from "../mistral/mistral-sdk-wrapper";
import { OpenRouterSdkWrapper } from "../openrouter/openrouter-sdk-wrapper";
import { TogetherSdkWrapper } from "../together/together-sdk-wrapper";
import { FireworksSdkWrapper } from "../fireworks/fireworks-sdk-wrapper";
import { CohereSdkWrapper } from "../cohere/cohere-sdk-wrapper";
import { XaiSdkWrapper } from "../xai/xai-sdk-wrapper";
import { AlibabaSdkWrapper } from "../alibaba/alibaba-sdk-wrapper";
import { MoonshotSdkWrapper } from "../moonshot/moonshot-sdk-wrapper";
import { MetaSdkWrapper } from "../meta/meta-sdk-wrapper";
import { PerplexitySdkWrapper } from "../perplexity/perplexity-sdk-wrapper";

export const PLACEHOLDER_SDK_VERSION: SdkVersion = {
  major: 0,
  minor: 0,
  patch: 0,
  raw: "0.0.0-placeholder",
};

export interface CreateWrapperOptions {
  readonly clientIdPrefix?: string;
  readonly version?: SdkVersion;
  readonly nowIso?: () => string;
}

function clientId(vendor: SdkVendor, prefix = "sdk"): ReturnType<typeof asSdkClientId> {
  return asSdkClientId(`${prefix}.${vendor}`);
}

function baseOptions(
  vendor: SdkVendor,
  options: CreateWrapperOptions = {}
) {
  return {
    clientId: clientId(vendor, options.clientIdPrefix),
    version: options.version ?? PLACEHOLDER_SDK_VERSION,
    nowIso: options.nowIso,
  };
}

export function createOpenAISdkWrapper(
  options?: CreateWrapperOptions
): OpenAISdkWrapper {
  return new OpenAISdkWrapper(baseOptions("openai", options));
}

export function createAnthropicSdkWrapper(
  options?: CreateWrapperOptions
): AnthropicSdkWrapper {
  return new AnthropicSdkWrapper(baseOptions("anthropic", options));
}

export function createGeminiSdkWrapper(
  options?: CreateWrapperOptions
): GeminiSdkWrapper {
  return new GeminiSdkWrapper(baseOptions("gemini", options));
}

export function createGroqSdkWrapper(
  options?: CreateWrapperOptions
): GroqSdkWrapper {
  return new GroqSdkWrapper(baseOptions("groq", options));
}

export function createDeepSeekSdkWrapper(
  options?: CreateWrapperOptions
): DeepSeekSdkWrapper {
  return new DeepSeekSdkWrapper(baseOptions("deepseek", options));
}

export function createMistralSdkWrapper(
  options?: CreateWrapperOptions
): MistralSdkWrapper {
  return new MistralSdkWrapper(baseOptions("mistral", options));
}

export function createOpenRouterSdkWrapper(
  options?: CreateWrapperOptions
): OpenRouterSdkWrapper {
  return new OpenRouterSdkWrapper(baseOptions("openrouter", options));
}

export function createTogetherSdkWrapper(
  options?: CreateWrapperOptions
): TogetherSdkWrapper {
  return new TogetherSdkWrapper(baseOptions("together", options));
}

export function createFireworksSdkWrapper(
  options?: CreateWrapperOptions
): FireworksSdkWrapper {
  return new FireworksSdkWrapper(baseOptions("fireworks", options));
}

export function createCohereSdkWrapper(
  options?: CreateWrapperOptions
): CohereSdkWrapper {
  return new CohereSdkWrapper(baseOptions("cohere", options));
}

export function createXaiSdkWrapper(
  options?: CreateWrapperOptions
): XaiSdkWrapper {
  return new XaiSdkWrapper(baseOptions("xai", options));
}

export function createAlibabaSdkWrapper(
  options?: CreateWrapperOptions
): AlibabaSdkWrapper {
  return new AlibabaSdkWrapper(baseOptions("alibaba", options));
}

export function createMoonshotSdkWrapper(
  options?: CreateWrapperOptions
): MoonshotSdkWrapper {
  return new MoonshotSdkWrapper(baseOptions("moonshot", options));
}

export function createMetaSdkWrapper(
  options?: CreateWrapperOptions
): MetaSdkWrapper {
  return new MetaSdkWrapper(baseOptions("meta", options));
}

export function createPerplexitySdkWrapper(
  options?: CreateWrapperOptions
): PerplexitySdkWrapper {
  return new PerplexitySdkWrapper(baseOptions("perplexity", options));
}

export function createAllPlaceholderWrappers(
  options?: CreateWrapperOptions
): readonly IProviderSdkClient[] {
  return [
    createOpenAISdkWrapper(options),
    createAnthropicSdkWrapper(options),
    createGeminiSdkWrapper(options),
    createGroqSdkWrapper(options),
    createDeepSeekSdkWrapper(options),
    createMistralSdkWrapper(options),
    createOpenRouterSdkWrapper(options),
    createTogetherSdkWrapper(options),
    createFireworksSdkWrapper(options),
    createCohereSdkWrapper(options),
    createXaiSdkWrapper(options),
    createAlibabaSdkWrapper(options),
    createMoonshotSdkWrapper(options),
    createMetaSdkWrapper(options),
    createPerplexitySdkWrapper(options),
  ];
}
