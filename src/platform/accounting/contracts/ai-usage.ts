/**
 * Normalized provider usage units — provider-independent billing dimensions.
 */

export interface NormalizedUsageUnit {
  readonly unit: string;
  readonly quantity: number;
}

export interface NormalizedAIUsage {
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly cachedInputTokens: number | null;
  readonly cachedOutputTokens: number | null;
  readonly reasoningTokens: number | null;
  readonly totalTokens: number | null;
  readonly otherUnits: readonly NormalizedUsageUnit[];
  /**
   * Exact USD cost reported by the provider for this request when available
   * (e.g. xAI `cost_in_usd_ticks`). Prefer over rate-table estimates.
   */
  readonly providerReportedCostUsd: string | null;
  readonly providerRequestId: string | null;
  readonly rawProviderUsage: Readonly<Record<string, unknown>> | null;
}

export const EMPTY_NORMALIZED_USAGE: NormalizedAIUsage = Object.freeze({
  inputTokens: null,
  outputTokens: null,
  cachedInputTokens: null,
  cachedOutputTokens: null,
  reasoningTokens: null,
  totalTokens: null,
  otherUnits: Object.freeze([]),
  providerReportedCostUsd: null,
  providerRequestId: null,
  rawProviderUsage: null,
});
