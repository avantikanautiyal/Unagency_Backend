/**
 * Multi-Provider Production Rollout contracts.
 * Evidence-driven multi-provider posture — does not redesign Intelligence OS.
 */

export type RolloutMode = "catalog_simulated" | "openai_live_evidence";

export type ProviderRolloutStatus =
  | "active"
  | "experimental"
  | "certification_failed"
  | "skipped";

export interface CapabilityProviderCoverage {
  readonly capabilityId: string;
  readonly providerIds: readonly string[];
  readonly modelIds: readonly string[];
  readonly multiProviderEligible: boolean;
}

export interface ModelInventoryRow {
  readonly providerId: string;
  readonly modelId: string;
  readonly modelLabel: string;
  readonly modalities: readonly string[];
  readonly discoverySource: "catalog_bootstrap" | "cache" | "live";
  readonly department: string;
}

export interface DiscoveryRecord {
  readonly providerId: string;
  readonly modelCount: number;
  readonly source: "catalog_bootstrap" | "cache" | "live";
  readonly discoveryEndpoint: string;
  readonly authScheme: string;
  readonly secretEnvHint: string;
  readonly ok: boolean;
  readonly notes: readonly string[];
}

export interface CapabilityMappingRow {
  readonly providerId: string;
  readonly capabilityId: string;
  readonly modalities: readonly string[];
  readonly features: Readonly<Record<string, boolean>>;
}

export interface RuntimeRegistrationRow {
  readonly providerId: string;
  readonly runtime: boolean;
  readonly negotiation: boolean;
  readonly routing: boolean;
  readonly mesh: boolean;
  readonly consensus: boolean;
  readonly certification: boolean;
  readonly capabilityIntelligence: boolean;
  readonly integrationLayer: boolean;
  readonly secretCompatible: boolean;
  readonly distributedExecutionCompatible: boolean;
  readonly observabilityCompatible: boolean;
  readonly status: ProviderRolloutStatus;
  readonly usedExistingOpenAILeaf: boolean;
  readonly generationFileCount: number;
  readonly notes: readonly string[];
}

export interface CertificationRow {
  readonly providerId: string;
  readonly certified: boolean;
  readonly notes: readonly string[];
  readonly checklistItems: readonly string[];
}

/**
 * Complete execution evidence for Learning / Evaluation / Model Intelligence.
 * Published without redesigning those modules.
 */
export interface BenchmarkExecutionEvidence {
  readonly evidenceId: string;
  readonly correlationId: string;
  readonly capabilityId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly latencyMs: number;
  readonly cost: number;
  readonly currency: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  readonly evaluationScore: number;
  readonly humanReviewRequired: boolean;
  readonly success: boolean;
  readonly retryCount: number;
  readonly streamingChunkCount: number;
  readonly streamingDurationMs: number;
  readonly capturedAt: string;
  readonly source: "catalog_simulated" | "production_openai" | "integration";
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface CrossProviderCapabilityComparison {
  readonly capabilityId: string;
  readonly providers: readonly {
    readonly providerId: string;
    readonly modelId: string;
    readonly evidenceId: string;
    readonly latencyMs: number;
    readonly cost: number;
    readonly evaluationScore: number;
    readonly success: boolean;
  }[];
  readonly routingChoiceEligible: boolean;
  readonly consensusEligible: boolean;
  readonly evaluationComparable: boolean;
  readonly learningComparable: boolean;
}

export interface CompatibilityChecklist {
  readonly secrets: boolean;
  readonly distributedExecution: boolean;
  readonly observability: boolean;
  readonly providerMesh: boolean;
  readonly productionValidation: boolean;
  readonly notes: readonly string[];
}

export interface MultiProviderRolloutRequest {
  readonly requestId: string;
  /** Defaults to full catalog. */
  readonly providerIds?: readonly string[];
  readonly mode?: RolloutMode;
  /** Publish evidence into observability when engine provided. */
  readonly publishObservability?: boolean;
  /** Require catalog certification for ACTIVE (default true). */
  readonly requireCertificationForActive?: boolean;
}

export interface MultiProviderRolloutReport {
  readonly requestId: string;
  readonly mode: RolloutMode;
  readonly providerCount: number;
  readonly modelCount: number;
  readonly generationFileCount: number;
  readonly activeCount: number;
  readonly experimentalCount: number;
  readonly allViaGenerator: true;
  readonly skippedInventedProviders: 0;
  readonly multiProviderCapabilityCount: number;
  readonly discoveries: readonly DiscoveryRecord[];
  readonly modelInventory: readonly ModelInventoryRow[];
  readonly capabilityMappings: readonly CapabilityMappingRow[];
  readonly capabilityCoverage: readonly CapabilityProviderCoverage[];
  readonly runtimeRegistrations: readonly RuntimeRegistrationRow[];
  readonly certifications: readonly CertificationRow[];
  readonly evidence: readonly BenchmarkExecutionEvidence[];
  readonly comparisons: readonly CrossProviderCapabilityComparison[];
  readonly compatibility: CompatibilityChecklist;
  readonly productionValidationAttached: boolean;
  readonly durationMs: number;
  readonly createdAt: string;
  readonly successCriteria: {
    readonly sameCapabilityAcrossProviders: boolean;
    readonly routingCanChoose: boolean;
    readonly consensusCanCombine: boolean;
    readonly evaluationCanCompare: boolean;
    readonly learningCanCompare: boolean;
    readonly evidenceDrivenRecommendationsReady: boolean;
  };
}
