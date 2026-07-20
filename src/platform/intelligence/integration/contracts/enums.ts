/** Intelligence OS Integration stage identifiers. */

export type IntegrationStageKind =
  | "task_intelligence"
  | "capability_intelligence"
  | "agent_planning"
  | "workflow_intelligence"
  | "execution_governance"
  | "experience_injection"
  | "execution_intelligence"
  | "model_intelligence"
  | "negotiation"
  | "routing"
  | "provider_runtime"
  | "consensus"
  | "evaluation"
  | "evaluation_intelligence"
  | "learning"
  | "execution_optimization"
  | "experience_intelligence"
  | "repository_updates";

export type BridgeStatus = "succeeded" | "failed" | "skipped";

export type IntegrationMode = "full" | "planning_through_routing";

export const INTEGRATION_PIPELINE_ORDER: readonly IntegrationStageKind[] = [
  "task_intelligence",
  "capability_intelligence",
  "agent_planning",
  "workflow_intelligence",
  "execution_governance",
  "experience_injection",
  "execution_intelligence",
  "model_intelligence",
  "negotiation",
  "routing",
  "provider_runtime",
  "consensus",
  "evaluation",
  "evaluation_intelligence",
  "learning",
  "execution_optimization",
  "experience_intelligence",
  "repository_updates",
] as const;
