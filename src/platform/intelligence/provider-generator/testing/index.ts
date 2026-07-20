/**
 * Provider Generator testing utilities.
 * Uses a fictional placeholder provider id for generator validation only —
 * does NOT emit Anthropic/Gemini/etc. production leaves.
 */

import { defaultApiKeyAuth } from "../authentication/auth-schema";
import type { ProviderManifestSpec } from "../contracts/manifest";
import { ProviderGenerationRequestBuilder } from "../builders/generation-request-builder";
import {
  createProviderGeneratorPlatform,
  type CreateProviderGeneratorOptions,
  type ProviderGeneratorPlatform,
} from "../factories/create-provider-generator-platform";

export function deterministicHelpers() {
  let id = 0;
  let ms = 0;
  return {
    createId: (prefix: string) => `${prefix}_${++id}`,
    nowIso: () => "2026-07-14T00:00:00.000Z",
    clockMs: () => (ms += 2),
  };
}

/** Fictional skeleton provider for generator tests only. */
export function sampleAcmeManifest(): ProviderManifestSpec {
  return {
    providerId: "acme",
    displayName: "Acme AI",
    category: "llm",
    version: "1.0.0",
    authentication: defaultApiKeyAuth("ACME_API_KEY"),
    discoveryEndpoint: "/v1/models",
    baseUrl: "https://api.acme.example",
    apiSpecification: "openai-compatible",
    supportedModalities: ["text", "structured"],
    features: {
      streaming: true,
      toolCalling: true,
      structuredOutput: true,
      embeddings: false,
      vision: false,
      audio: false,
      image: false,
      video: false,
      reasoning: true,
    },
    capabilityMatrix: [
      {
        capabilityId: "marketing.copywriting",
        modalities: ["text"],
        requiredFeatures: ["streaming"],
      },
      {
        capabilityId: "software.code_generation",
        modalities: ["text"],
        requiredFeatures: ["toolCalling", "reasoning"],
      },
      {
        capabilityId: "research.market_analysis",
        modalities: ["text"],
        requiredFeatures: ["reasoning"],
      },
    ],
    regions: ["us-east-1", "eu-west-1"],
    rateLimits: { requestsPerMinute: 60, tokensPerMinute: 100000 },
    pricing: { currency: "USD", inputPer1k: 0.001, outputPer1k: 0.002 },
  };
}

export function sampleGenerationRequest() {
  return ProviderGenerationRequestBuilder.create()
    .withRequestId("gen_acme_1")
    .withManifest(sampleAcmeManifest())
    .withMode("dry_run")
    .build();
}

export function setupProviderGenerator(
  options: CreateProviderGeneratorOptions = {}
): ProviderGeneratorPlatform {
  const helpers = deterministicHelpers();
  return createProviderGeneratorPlatform({
    createId: helpers.createId,
    nowIso: helpers.nowIso,
    clockMs: helpers.clockMs,
    ...options,
  });
}
