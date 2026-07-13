/**
 * Context optimization plan.
 */

export interface ContextOptimizationPlan {
  readonly originalSize: number;
  readonly optimizedSize: number;
  readonly relevanceScore: number;
  readonly orderingApplied: boolean;
  readonly deduplicationApplied: boolean;
  readonly priorityApplied: boolean;
  readonly freshnessApplied: boolean;
  readonly actions: readonly string[];
}
