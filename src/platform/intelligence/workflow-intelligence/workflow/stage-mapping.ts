/**
 * Stage mapping heuristics.
 */

import type { WorkflowStageKind } from "../contracts/enums";

const ROLE_STAGE_MAP: Record<string, WorkflowStageKind> = {
  research: "research",
  analyst: "research",
  intelligence: "research",
  strategist: "planning",
  planner: "planning",
  campaign: "planning",
  copywriter: "generation",
  creative: "generation",
  designer: "generation",
  media: "generation",
  seo: "generation",
  qa: "review",
  reviewer: "review",
  approval: "approval",
  human: "approval",
  performance: "monitoring",
  kpi: "monitoring",
};

export function stageForRole(role: string): WorkflowStageKind {
  const lower = role.toLowerCase();
  for (const [key, stage] of Object.entries(ROLE_STAGE_MAP)) {
    if (lower.includes(key)) return stage;
  }
  return "generation";
}

export const STAGE_ORDER: Record<WorkflowStageKind, number> = {
  research: 1,
  planning: 2,
  generation: 3,
  review: 4,
  validation: 5,
  approval: 6,
  publishing: 7,
  monitoring: 8,
  completion: 9,
  custom: 10,
};

export function artifactsForStage(stage: WorkflowStageKind): {
  produces: import("../contracts/enums").ArtifactFlowKind[];
  consumes: import("../contracts/enums").ArtifactFlowKind[];
} {
  switch (stage) {
    case "research":
      return { produces: ["research_artifact", "knowledge_artifact"], consumes: ["context_artifact"] };
    case "planning":
      return { produces: ["decision_artifact", "knowledge_artifact"], consumes: ["research_artifact", "brand_artifact"] };
    case "generation":
      return { produces: ["creative_artifact", "execution_artifact"], consumes: ["decision_artifact", "brand_artifact"] };
    case "review":
      return { produces: ["review_artifact"], consumes: ["creative_artifact", "execution_artifact"] };
    case "approval":
      return { produces: ["approval_artifact", "decision_artifact"], consumes: ["review_artifact"] };
    case "monitoring":
      return { produces: ["execution_artifact"], consumes: ["approval_artifact"] };
    default:
      return { produces: ["execution_artifact"], consumes: ["context_artifact"] };
  }
}
