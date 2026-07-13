/**
 * Prompt optimization plan.
 */

export interface PromptOptimizationPlan {
  readonly structureOptimized: boolean;
  readonly instructionsOptimized: boolean;
  readonly examplesOptimized: boolean;
  readonly constraintsOptimized: boolean;
  readonly roleOptimized: boolean;
  readonly schemaOptimized: boolean;
  readonly outputFormatOptimized: boolean;
  readonly brandRulesApplied: boolean;
  readonly evaluationCriteriaApplied: boolean;
  readonly actions: readonly string[];
  readonly estimatedQualityGain: number;
}
