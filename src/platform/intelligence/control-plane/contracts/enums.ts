/**
 * Control Plane enumerations.
 */

export type PipelineStageKind =
  | "task_intelligence"
  | "agent_planning"
  | "workflow_intelligence"
  | "execution_governance"
  | "execution_intelligence"
  | "model_intelligence"
  | "negotiation"
  | "routing";

export type PipelineStateKind =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export type ControlPlaneMode = "plan" | "simulate";
