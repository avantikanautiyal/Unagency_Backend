/**
 * Workflow Intelligence enumerations.
 */

export type WorkflowStageKind =
  | "research"
  | "planning"
  | "generation"
  | "review"
  | "validation"
  | "approval"
  | "publishing"
  | "monitoring"
  | "completion"
  | "custom";

export type WorkflowNodeKind =
  | "execution"
  | "parallel_group"
  | "conditional"
  | "approval_gate"
  | "checkpoint"
  | "merge"
  | "rollback"
  | "resume"
  | "failure";

export type DependencyKind =
  | "hard"
  | "soft"
  | "optional"
  | "blocking"
  | "approval"
  | "artifact"
  | "time"
  | "human";

export type ApprovalGateKind =
  | "creative"
  | "legal"
  | "compliance"
  | "brand"
  | "customer"
  | "human";

export type CheckpointKind =
  | "save_point"
  | "review_point"
  | "quality_point"
  | "recovery_point"
  | "audit_point"
  | "human_checkpoint";

export type RecoveryActionKind =
  | "retry"
  | "fallback"
  | "escalation"
  | "human_intervention"
  | "rollback"
  | "restart_stage"
  | "restart_workflow"
  | "skip"
  | "abort";

export type ConditionalBranchKind = "if" | "else" | "switch" | "loop" | "human_decision" | "policy_decision" | "quality_decision";

export type ArtifactFlowKind =
  | "context_artifact"
  | "knowledge_artifact"
  | "research_artifact"
  | "brand_artifact"
  | "creative_artifact"
  | "execution_artifact"
  | "review_artifact"
  | "approval_artifact"
  | "decision_artifact"
  | "memory_artifact";

export type WorkflowLifecycleState =
  | "draft"
  | "validated"
  | "approved"
  | "executable"
  | "running"
  | "paused"
  | "blocked"
  | "completed"
  | "cancelled"
  | "archived";

export type WorkflowVersionKind = "major" | "minor" | "patch" | "snapshot";
