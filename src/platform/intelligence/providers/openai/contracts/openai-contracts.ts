/**
 * Desired capability profile — input to Model Resolver.
 * Produced upstream by Model Intelligence / Negotiation / Routing.
 * Never contains hardcoded model names like gpt-4 / gpt-5.
 */

export interface DesiredCapabilityProfile {
  readonly capabilityId?: string;
  readonly modality?: "text" | "image" | "audio" | "embedding" | "multimodal" | "structured";
  readonly requireStreaming?: boolean;
  readonly requireToolCalling?: boolean;
  readonly requireVision?: boolean;
  readonly requireAudio?: boolean;
  readonly requireEmbeddings?: boolean;
  readonly requireReasoning?: boolean;
  readonly requireStructuredOutputs?: boolean;
  readonly requireJsonMode?: boolean;
  readonly minContextWindow?: number;
  readonly maxCostPreference?: "low" | "balanced" | "quality";
  readonly preferReasoning?: boolean;
  readonly language?: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export type OpenAIProviderStatus =
  | "uninitialized"
  | "discovering"
  | "certifying"
  | "experimental"
  | "active"
  | "degraded"
  | "disabled";

export interface OpenAIAuthenticationConfig {
  readonly apiKey?: string;
  readonly organizationId?: string;
  readonly projectId?: string;
  readonly credentialRef?: string;
  readonly baseUrl?: string;
}

export interface OpenAIQuotaMetadata {
  readonly requestsPerMinute?: number;
  readonly tokensPerMinute?: number;
  readonly requestsPerDay?: number;
}

export interface DiscoveredOpenAIModel {
  readonly id: string;
  readonly ownedBy?: string;
  readonly created?: number;
  readonly modalities: readonly string[];
  readonly capability: {
    readonly streaming: boolean;
    readonly toolCalling: boolean;
    readonly vision: boolean;
    readonly audio: boolean;
    readonly embeddings: boolean;
    readonly reasoning: boolean;
    readonly structuredOutputs: boolean;
    readonly jsonMode: boolean;
    readonly contextWindow?: number;
    readonly maxOutputTokens?: number;
  };
  readonly pricing?: {
    readonly inputPerMillion?: number;
    readonly outputPerMillion?: number;
  };
  readonly lifecycle: "active" | "deprecated" | "legacy" | "preview";
  readonly releaseDate?: string;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface OpenAIModelDiscoveryResult {
  readonly discoveredAt: string;
  readonly models: readonly DiscoveredOpenAIModel[];
  readonly cacheHit: boolean;
  readonly source: "live" | "simulated" | "cache";
}

export interface OpenAIModelResolution {
  readonly selectedModelId: string;
  readonly candidates: readonly string[];
  readonly score: number;
  readonly rationale: string;
  readonly profile: DesiredCapabilityProfile;
  readonly resolvedAt: string;
}

export interface OpenAIExecutionMetrics {
  readonly latencyMs: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly reasoningTokens?: number;
  readonly totalTokens?: number;
  readonly cacheHits?: number;
  readonly streamingDurationMs?: number;
  readonly retryCount: number;
  readonly estimatedCost?: number;
  readonly errorCode?: string;
  readonly modelId: string;
  readonly operation: string;
}

export interface OpenAIExecutionArtifacts {
  readonly executionArtifact: Readonly<Record<string, unknown>>;
  readonly evaluationArtifactCandidate: Readonly<Record<string, unknown>>;
  readonly experienceCandidate: Readonly<Record<string, unknown>>;
  readonly providerMetrics: OpenAIExecutionMetrics;
  readonly modelMetrics: Readonly<Record<string, unknown>>;
}
