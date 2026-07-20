/**
 * Unified explainability contracts.
 */

export interface UnifiedExplanation {
  readonly summary: string;
  readonly taskRationale: string;
  readonly agentRationale: string;
  readonly workflowRationale: string;
  readonly governanceRationale: string;
  readonly executionStrategyRationale: string;
  readonly modelRecommendationRationale: string;
  readonly negotiationRationale: string;
  readonly routingRationale: string;
  readonly stageSummaries: Readonly<Record<string, string>>;
}
