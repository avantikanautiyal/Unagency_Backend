/**
 * Template metrics contracts.
 */

export interface TemplateProviderMetrics {
  readonly latencyMs: number;
  readonly ttfbMs?: number;
  readonly completionTimeMs?: number;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  readonly retries: number;
  readonly streamingTimeMs?: number;
  readonly toolCalls: number;
  readonly functionCalls: number;
  readonly estimatedCost: number;
  readonly success: boolean;
  readonly cancelled: boolean;
  readonly timedOut: boolean;
  readonly collectedAt: string;
}

export interface TemplateMetricsSnapshot {
  readonly providerId: string;
  readonly successRate: number;
  readonly failureRate: number;
  readonly averageLatencyMs: number;
  readonly totalRequests: number;
  readonly computedAt: string;
}
