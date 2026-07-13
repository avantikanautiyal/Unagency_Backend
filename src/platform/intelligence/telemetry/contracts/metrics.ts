export interface TokenMetrics {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly cachedInputTokens?: number;
}

export interface CostMetrics {
  readonly amount: number;
  readonly currency?: string;
}

export interface ExecutionMetrics {
  readonly executionId: string;
  readonly capabilityId?: string;
  readonly providerId?: string;
  readonly latencyMs?: number;
  readonly tokens?: TokenMetrics;
  readonly cost?: CostMetrics;
  readonly qualityScore?: number;
  readonly confidenceScore?: number;
  readonly status?: string;
}

export interface MetricTags {
  readonly [key: string]: string;
}
