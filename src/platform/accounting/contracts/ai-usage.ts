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
  providerRequestId: null,
  rawProviderUsage: null,
});
