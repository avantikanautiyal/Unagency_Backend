/** Control Plane constants. */

export const CONTROL_PLANE_VERSION = "1.0.0";

export const PIPELINE_STAGE_ORDER = [
  "task_intelligence",
  "agent_planning",
  "workflow_intelligence",
  "execution_governance",
  "execution_intelligence",
  "model_intelligence",
  "negotiation",
  "routing",
] as const;
