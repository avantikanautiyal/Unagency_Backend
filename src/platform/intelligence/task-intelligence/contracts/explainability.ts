/**
 * Explainability contracts.
 */

export interface TaskPlanExplanation {
  readonly classificationRationale: string;
  readonly capabilityRationale: string;
  readonly decompositionRationale: string;
  readonly dependencyRationale: string;
  readonly reviewRationale: string;
  readonly qualityRationale: string;
  readonly playbookApplied?: string;
}
