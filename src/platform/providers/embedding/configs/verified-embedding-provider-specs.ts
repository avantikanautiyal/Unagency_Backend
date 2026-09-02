/**
 * Verified embedding provider specs — LIVE only when vendorApiVerified=true.
 * Inventory presence alone does not imply executable.
 */

export interface VerifiedEmbeddingProviderSpec {
  readonly canonicalProviderId: string;
  readonly vendor: string;
  readonly displayName: string;
  readonly inventoryModelId: string;
  readonly wireModelId: string;
  readonly credentialEnvVar: string;
  readonly enableEnvVar: string;
  readonly liveSmokeEnvVar: string;
  readonly vendorApiVerified: boolean;
  readonly blockedReason?: string;
  readonly operation: string;
  readonly endpointHint: string;
}

export const OPENAI_EMBEDDING_SPEC: VerifiedEmbeddingProviderSpec = {
  canonicalProviderId: "provider.openai",
  vendor: "openai",
  displayName: "OpenAI",
  inventoryModelId: "text-embedding-3-large",
  wireModelId: "text-embedding-3-large",
  credentialEnvVar: "OPENAI_API_KEY",
  enableEnvVar: "OPENAI_ENABLED",
  liveSmokeEnvVar: "RUN_LIVE_OPENAI_EMBEDDING_SMOKE",
  vendorApiVerified: true,
  operation: "embeddings",
  endpointHint: "POST /v1/embeddings",
};

export const COHERE_EMBEDDING_SPEC: VerifiedEmbeddingProviderSpec = {
  canonicalProviderId: "provider.cohere",
  vendor: "cohere",
  displayName: "Cohere",
  inventoryModelId: "embed-english-v3.0",
  wireModelId: "embed-english-v3.0",
  credentialEnvVar: "COHERE_API_KEY",
  enableEnvVar: "COHERE_ENABLED",
  liveSmokeEnvVar: "RUN_LIVE_COHERE_EMBEDDING_SMOKE",
  vendorApiVerified: true,
  operation: "embed",
  endpointHint: "POST /v2/embed",
};

export const MISTRAL_EMBEDDING_SPEC: VerifiedEmbeddingProviderSpec = {
  canonicalProviderId: "provider.mistral",
  vendor: "mistral",
  displayName: "Mistral",
  inventoryModelId: "mistral-embed",
  wireModelId: "mistral-embed",
  credentialEnvVar: "MISTRAL_API_KEY",
  enableEnvVar: "MISTRAL_ENABLED",
  liveSmokeEnvVar: "RUN_LIVE_MISTRAL_EMBEDDING_SMOKE",
  vendorApiVerified: true,
  operation: "embeddings",
  endpointHint: "POST /v1/embeddings (OpenAI-compatible)",
};

/** Inventory lists text-embedding-004 but that model is deprecated on Gemini API (2026). */
export const GEMINI_EMBEDDING_SPEC: VerifiedEmbeddingProviderSpec = {
  canonicalProviderId: "provider.gemini",
  vendor: "gemini",
  displayName: "Google Gemini",
  inventoryModelId: "text-embedding-004",
  wireModelId: "text-embedding-004",
  credentialEnvVar: "GEMINI_API_KEY",
  enableEnvVar: "GEMINI_ENABLED",
  liveSmokeEnvVar: "RUN_LIVE_GEMINI_EMBEDDING_SMOKE",
  vendorApiVerified: false,
  blockedReason:
    "INVENTORY_MODEL_DEPRECATED — text-embedding-004 not verified for LIVE embedContent; leaf has no embedContent mapping",
  operation: "embedContent",
  endpointHint: "POST /v1beta/models/{model}:embedContent",
};

export const VERIFIED_EMBEDDING_PROVIDER_SPECS: readonly VerifiedEmbeddingProviderSpec[] = [
  OPENAI_EMBEDDING_SPEC,
  COHERE_EMBEDDING_SPEC,
  MISTRAL_EMBEDDING_SPEC,
];

export const ALL_EMBEDDING_PROVIDER_SPECS: readonly VerifiedEmbeddingProviderSpec[] = [
  ...VERIFIED_EMBEDDING_PROVIDER_SPECS,
  GEMINI_EMBEDDING_SPEC,
];

export const EMBEDDING_EXECUTABLE_PROVIDER_IDS = new Set(
  VERIFIED_EMBEDDING_PROVIDER_SPECS.map((s) => s.canonicalProviderId)
);

export function isEmbeddingExecutableProvider(providerId: string): boolean {
  return EMBEDDING_EXECUTABLE_PROVIDER_IDS.has(providerId);
}
