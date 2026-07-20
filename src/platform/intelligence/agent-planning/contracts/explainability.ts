/**
 * Explainability contracts.
 */

export interface AgentPlanningExplanation {
  readonly roleSelectionRationale: string;
  readonly dependencyRationale: string;
  readonly reviewHierarchyRationale: string;
  readonly mergeStrategyRationale: string;
  readonly fallbackRationale: string;
  readonly coordinationRationale: string;
  readonly playbookApplied?: string;
}

export interface TeamRecommendation {
  readonly recommendationId: string;
  readonly teamName: string;
  readonly recommendedRoles: readonly string[];
  readonly confidence: number;
  readonly rationale: string;
}
