/**
 * Token budget and compression contracts.
 */

export interface ExecutionBudget {
  readonly promptTokens: number;
  readonly knowledgeTokens: number;
  readonly reasoningBudget: number;
  readonly responseBudget: number;
  readonly reserveBudget: number;
  readonly maximumContext: number;
  readonly totalEstimated: number;
  readonly compressionRatio: number;
}

export interface ExecutionCompressionPlan {
  readonly targetRatio: number;
  readonly contextReduction: number;
  readonly knowledgeReduction: number;
  readonly promptReduction: number;
  readonly actions: readonly string[];
  readonly estimatedSavings: number;
}
