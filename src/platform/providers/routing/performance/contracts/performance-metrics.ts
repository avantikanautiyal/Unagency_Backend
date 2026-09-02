/**
 * Aggregated provider/model performance metrics (M9.5H).
 */

export interface ModelPerformanceMetrics {
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityId?: string;
  readonly organizationId?: string;

  readonly successRate: number;
  readonly evaluationMean?: number;
  readonly evaluationP50?: number;
  readonly evaluationP95?: number;

  readonly latencyP50?: number;
  readonly latencyP95?: number;

  readonly failureRate: number;
  readonly timeoutRate: number;
  readonly rateLimitRate: number;

  readonly averageTokens?: number;
  /** Mean of costEligible samples in a single currency; null when none. */
  readonly averageCost?: number | null;
  readonly costCurrency?: string | null;
  readonly costSampleCount?: number;
  readonly unknownCostSampleCount?: number;

  readonly sampleCount: number;
  readonly recentSampleCount: number;

  readonly lastSuccessAt?: string;
  readonly lastFailureAt?: string;

  readonly windowStart: string;
  readonly windowEnd: string;
}

export type PerformanceScope =
  | { readonly kind: "global" }
  | { readonly kind: "capability"; readonly capabilityId: string }
  | {
      readonly kind: "tenant";
      readonly organizationId: string;
      readonly capabilityId?: string;
    };
