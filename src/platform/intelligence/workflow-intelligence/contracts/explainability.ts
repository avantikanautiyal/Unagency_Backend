/**
 * Explainability contracts.
 */

export interface WorkflowExplanation {
  readonly stageRationale: string;
  readonly dependencyRationale: string;
  readonly approvalRationale: string;
  readonly parallelRationale: string;
  readonly rollbackRationale: string;
  readonly checkpointRationale: string;
  readonly recoveryRationale: string;
}
