/**
 * Safe execution-intelligence response contracts for the Enterprise API Gateway.
 * Never include prompts, provider secrets, or internal implementation dumps.
 */

export type TimelineEventStatus = "pending" | "running" | "ok" | "skipped" | "error";

export interface ModelCandidateScore {
  readonly providerId: string;
  readonly providerName: string;
  readonly modelId: string;
  readonly modelVersion?: string;
  readonly rankingScore: number;
  readonly capabilityMatchScore: number;
  readonly latencyScore: number;
  readonly costScore: number;
  readonly qualityScore: number;
  readonly contextWindowScore: number;
  readonly toolCallingSupport: boolean;
  readonly visionSupport: boolean;
  readonly streamingSupport: boolean;
  readonly reasonRejected?: string;
}

export interface ModelDecisionResponse {
  readonly executionId: string;
  readonly capabilityId?: string;
  readonly resolvedProviderId: string;
  readonly resolvedProviderName: string;
  readonly resolvedModelId: string;
  readonly modelVersion?: string;
  readonly reasoningStrategy: string;
  readonly candidateModels: readonly ModelCandidateScore[];
  readonly rankingScores: Readonly<Record<string, number>>;
  readonly capabilityMatchScore: number;
  readonly latencyScore: number;
  readonly costScore: number;
  readonly qualityScore: number;
  readonly contextWindowScore: number;
  readonly toolCallingSupport: boolean;
  readonly visionSupport: boolean;
  readonly streamingSupport: boolean;
  readonly reasonSelected: string;
  readonly reasonsRejected: readonly string[];
  readonly fallbackModels: readonly string[];
  readonly decisionTimestamp: string;
  readonly decisionDurationMs: number;
}

export interface RoutingResponse {
  readonly executionId: string;
  readonly negotiationSummary: string;
  readonly providerRanking: readonly {
    readonly providerId: string;
    readonly providerName: string;
    readonly rank: number;
    readonly score: number;
  }[];
  readonly routingStrategy: string;
  readonly policyDecisions: readonly string[];
  readonly budgetConstraints: Readonly<Record<string, unknown>>;
  readonly complianceConstraints: readonly string[];
  readonly fallbackChain: readonly string[];
  readonly retryStrategy: string;
  readonly circuitBreakerStatus: string;
}

export interface PlanningResponse {
  readonly executionId: string;
  readonly detectedIntent: string;
  readonly capabilityTree: readonly string[];
  readonly department?: string;
  readonly workflow?: string;
  readonly agentsPlanned: readonly string[];
  readonly executionGraph: Readonly<Record<string, unknown>>;
  readonly executionPlanVersion: string;
}

export interface TimelineEvent {
  readonly eventId: string;
  readonly name: string;
  readonly timestamp: string;
  readonly durationMs: number;
  readonly status: TimelineEventStatus;
}

export interface TimelineResponse {
  readonly executionId: string;
  readonly events: readonly TimelineEvent[];
}

export interface ProviderResponse {
  readonly executionId: string;
  readonly providerId: string;
  readonly providerName: string;
  readonly modelId: string;
  readonly modelVersion?: string;
  readonly region?: string;
  readonly healthStatus: string;
  readonly negotiationOutcome: string;
}

export interface MetricsResponse {
  readonly executionId: string;
  readonly status: string;
  readonly latencyMs: number;
  readonly queueWaitMs: number;
  readonly providerLatencyMs: number;
  readonly evaluationLatencyMs: number;
  readonly totalDurationMs: number;
  readonly success: boolean;
}

export interface TokensResponse {
  readonly executionId: string;
  readonly promptTokens: number;
  readonly contextTokens: number;
  readonly completionTokens: number;
  readonly cachedTokens: number;
  readonly reasoningTokens: number;
  readonly totalTokens: number;
  readonly providerUsage: Readonly<Record<string, number>>;
}

export interface CostBreakdownResponse {
  readonly executionId: string;
  readonly currency: string;
  readonly providerCost: number;
  readonly modelCost: number;
  readonly inputCost: number;
  readonly outputCost: number;
  readonly storageCost: number;
  readonly evaluationCost: number;
  readonly totalCost: number;
  readonly organizationBudgetRemaining?: number;
}

export interface QualityResponse {
  readonly executionId: string;
  readonly evaluationScore: number;
  readonly confidence: number;
  readonly policyCompliance: number;
  readonly brandCompliance: number;
  readonly knowledgeCoverage: number;
  readonly hallucinationRisk: number;
  readonly reviewRequired: boolean;
}

export interface ConfidenceResponse {
  readonly executionId: string;
  readonly overallConfidence: number;
  readonly modelConfidence: number;
  readonly routingConfidence: number;
  readonly evaluationConfidence: number;
  readonly experienceConfidence: number;
  readonly bands: Readonly<Record<string, "high" | "medium" | "low">>;
}

export interface AuditResponse {
  readonly executionId: string;
  readonly organizationId: string;
  readonly workspaceId?: string;
  readonly capabilityId?: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly policies: readonly string[];
  readonly versionIds: Readonly<Record<string, string | number>>;
  readonly brandBrainVersion?: number;
  readonly knowledgeVersion?: number;
  readonly experienceVersion?: string;
  readonly evaluationVersion?: string;
  readonly immutable: true;
  readonly auditedAt: string;
}

export interface DecisionGraphResponse {
  readonly executionId: string;
  readonly intent: string;
  readonly capability?: string;
  readonly brandBrain?: { readonly version: number };
  readonly knowledge?: { readonly version: number };
  readonly candidateProviders: readonly string[];
  readonly candidateModels: readonly {
    readonly provider: string;
    readonly model: string;
    readonly score: number;
  }[];
  readonly selected: {
    readonly provider: string;
    readonly model: string;
    readonly reason: string;
  };
}

/** Internal snapshot stored with an execution — never contains prompts or secrets. */
export interface ExecutionIntelligenceSnapshot {
  readonly executionId: string;
  readonly organizationId: string;
  readonly workspaceId?: string;
  readonly capabilityId?: string;
  readonly intent: string;
  readonly department?: string;
  readonly workflow?: string;
  readonly providerId: string;
  readonly providerName: string;
  readonly modelId: string;
  readonly modelVersion?: string;
  readonly reasoningStrategy: string;
  readonly routingStrategy: string;
  readonly negotiationSummary: string;
  readonly candidates: readonly ModelCandidateScore[];
  readonly fallbackModels: readonly string[];
  readonly fallbackChain: readonly string[];
  readonly policyDecisions: readonly string[];
  readonly complianceConstraints: readonly string[];
  readonly budgetConstraints: Readonly<Record<string, unknown>>;
  readonly retryStrategy: string;
  readonly circuitBreakerStatus: string;
  readonly agentsPlanned: readonly string[];
  readonly capabilityTree: readonly string[];
  readonly executionGraph: Readonly<Record<string, unknown>>;
  readonly executionPlanVersion: string;
  readonly tokens: {
    readonly promptTokens: number;
    readonly contextTokens: number;
    readonly completionTokens: number;
    readonly cachedTokens: number;
    readonly reasoningTokens: number;
  };
  readonly costs: {
    readonly currency: string;
    readonly providerCost: number;
    readonly modelCost: number;
    readonly inputCost: number;
    readonly outputCost: number;
    readonly storageCost: number;
    readonly evaluationCost: number;
    readonly totalCost: number;
    readonly organizationBudgetRemaining?: number;
  };
  readonly quality: {
    readonly evaluationScore: number;
    readonly confidence: number;
    readonly policyCompliance: number;
    readonly brandCompliance: number;
    readonly knowledgeCoverage: number;
    readonly hallucinationRisk: number;
    readonly reviewRequired: boolean;
  };
  readonly timeline: readonly TimelineEvent[];
  readonly metrics: {
    readonly latencyMs: number;
    readonly queueWaitMs: number;
    readonly providerLatencyMs: number;
    readonly evaluationLatencyMs: number;
    readonly totalDurationMs: number;
  };
  readonly brandBrainVersion?: number;
  readonly knowledgeVersion?: number;
  readonly experienceVersion?: string;
  readonly evaluationVersion?: string;
  readonly policies: readonly string[];
  readonly decisionTimestamp: string;
  readonly decisionDurationMs: number;
  readonly containsPrompt: false;
  readonly containsSecrets: false;
}
