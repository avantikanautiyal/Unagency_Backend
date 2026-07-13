/**
 * Knowledge optimization plan.
 */

export interface KnowledgeOptimizationPlan {
  readonly originalChunks: number;
  readonly selectedChunks: number;
  readonly rankingApplied: boolean;
  readonly compressionApplied: boolean;
  readonly redundancyRemoved: number;
  readonly knowledgeBudget: number;
  readonly actions: readonly string[];
}
