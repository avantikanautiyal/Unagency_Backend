/**
 * Workflow configuration placeholders for future milestones.
 */

export interface WorkflowConfig {
  readonly enabled: boolean;
  readonly maxSteps: number;
}

export function loadWorkflowConfig(): WorkflowConfig {
  return {
    enabled:
      (process.env.INTELLIGENCE_WORKFLOW_ENABLED ?? "false").toLowerCase() ===
      "true",
    maxSteps: Number(process.env.INTELLIGENCE_WORKFLOW_MAX_STEPS ?? 25),
  };
}
