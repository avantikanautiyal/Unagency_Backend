/**
 * SDK capability catalog.
 *
 * Purpose: Declarative capabilities per SDK vendor.
 * Responsibilities: Map a vendor to its default SdkCapability.
 * Usage: Wrappers, diagnostics, registry validation.
 * Future Extension: Per-model capability overrides.
 */

import type { SdkCapability } from "../contracts/descriptors";
import type { SdkVendor } from "../contracts/enums";

const CATALOG: Readonly<Record<SdkVendor, SdkCapability>> = {
  openai: {
    vendor: "openai",
    streaming: true,
    functionCalling: true,
    vision: true,
    audio: true,
    embeddings: true,
    reasoning: true,
    structuredOutput: true,
    authenticationKinds: ["api_key", "bearer", "oauth", "service_account"],
  },
  anthropic: {
    vendor: "anthropic",
    streaming: true,
    functionCalling: true,
    vision: true,
    audio: false,
    embeddings: false,
    reasoning: true,
    structuredOutput: true,
    authenticationKinds: ["api_key", "bearer"],
  },
  gemini: {
    vendor: "gemini",
    streaming: true,
    functionCalling: true,
    vision: true,
    audio: true,
    embeddings: true,
    reasoning: true,
    structuredOutput: true,
    authenticationKinds: ["api_key", "bearer", "service_account"],
  },
  groq: {
    vendor: "groq",
    streaming: true,
    functionCalling: true,
    vision: false,
    audio: false,
    embeddings: false,
    reasoning: false,
    structuredOutput: true,
    authenticationKinds: ["api_key", "bearer"],
  },
  deepseek: {
    vendor: "deepseek",
    streaming: true,
    functionCalling: true,
    vision: false,
    audio: false,
    embeddings: false,
    reasoning: true,
    structuredOutput: true,
    authenticationKinds: ["api_key", "bearer"],
  },
  mistral: {
    vendor: "mistral",
    streaming: true,
    functionCalling: true,
    vision: true,
    audio: false,
    embeddings: true,
    reasoning: false,
    structuredOutput: true,
    authenticationKinds: ["api_key", "bearer"],
  },
  openrouter: {
    vendor: "openrouter",
    streaming: true,
    functionCalling: true,
    vision: true,
    audio: false,
    embeddings: false,
    reasoning: false,
    structuredOutput: true,
    authenticationKinds: ["api_key", "bearer"],
  },
  together: {
    vendor: "together",
    streaming: true,
    functionCalling: true,
    vision: false,
    audio: false,
    embeddings: true,
    reasoning: false,
    structuredOutput: true,
    authenticationKinds: ["api_key", "bearer"],
  },
  fireworks: {
    vendor: "fireworks",
    streaming: true,
    functionCalling: true,
    vision: false,
    audio: false,
    embeddings: true,
    reasoning: false,
    structuredOutput: true,
    authenticationKinds: ["api_key", "bearer"],
  },
  cohere: {
    vendor: "cohere",
    streaming: true,
    functionCalling: true,
    vision: false,
    audio: false,
    embeddings: true,
    reasoning: false,
    structuredOutput: true,
    authenticationKinds: ["api_key", "bearer"],
  },
  xai: {
    vendor: "xai",
    streaming: true,
    functionCalling: true,
    vision: true,
    audio: false,
    embeddings: false,
    reasoning: false,
    structuredOutput: true,
    authenticationKinds: ["api_key", "bearer"],
  },
  alibaba: {
    vendor: "alibaba",
    streaming: true,
    functionCalling: true,
    vision: false,
    audio: false,
    embeddings: false,
    reasoning: true,
    structuredOutput: true,
    authenticationKinds: ["api_key", "bearer"],
  },
  moonshot: {
    vendor: "moonshot",
    streaming: true,
    functionCalling: true,
    vision: false,
    audio: false,
    embeddings: false,
    reasoning: true,
    structuredOutput: true,
    authenticationKinds: ["api_key", "bearer"],
  },
  meta: {
    vendor: "meta",
    streaming: true,
    functionCalling: true,
    vision: true,
    audio: false,
    embeddings: false,
    reasoning: true,
    structuredOutput: true,
    authenticationKinds: ["api_key", "bearer"],
  },
  perplexity: {
    vendor: "perplexity",
    streaming: true,
    functionCalling: false,
    vision: false,
    audio: false,
    embeddings: false,
    reasoning: true,
    structuredOutput: false,
    authenticationKinds: ["api_key", "bearer"],
  },
};

export function capabilityForVendor(vendor: SdkVendor): SdkCapability {
  return CATALOG[vendor];
}

export function allSdkVendors(): readonly SdkVendor[] {
  return Object.keys(CATALOG) as SdkVendor[];
}
