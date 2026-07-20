/**
 * Execution context extracted for experience matching.
 * Reuses dimensions from Experience ApplicabilityConditions — no prompt content.
 */

import type { CapabilityId, OrganizationId, WorkspaceId } from "../../shared/identifiers";
import type { StructuredTaskPlan } from "../../task-intelligence/contracts/planning";
import type { ExecutionTeamPlan } from "../../agent-planning/contracts/team-plan";
import type { WorkflowExecutionPlan } from "../../workflow-intelligence/contracts/plan";
import type { GovernanceExecutionPlan } from "../../execution-governance/contracts/plan";
import type { PromptMetadata } from "../../execution-optimization/contracts/inputs";
import type { KnowledgeSnapshot } from "../../knowledge/contracts/knowledge-models";

export interface ExperienceInjectionContext {
  readonly capabilityId?: CapabilityId;
  readonly department?: string;
  readonly industry?: string;
  readonly taskType?: string;
  readonly workflowId?: string;
  readonly executionStrategy?: string;
  readonly reasoningStrategy?: string;
  readonly promptTemplateId?: string;
  readonly modelId?: string;
  readonly providerId?: string;
  readonly language?: string;
  readonly region?: string;
  readonly budgetTier?: string;
  readonly complexityTier?: string;
  readonly organizationId?: OrganizationId;
  readonly workspaceId?: WorkspaceId;
  readonly campaignId?: string;
  readonly projectId?: string;
  readonly budgetLimit?: number;
}

export interface ExperienceInjectionRequest {
  readonly requestId: string;
  readonly context: ExperienceInjectionContext;
  readonly structuredTaskPlan?: StructuredTaskPlan;
  readonly executionTeamPlan?: ExecutionTeamPlan;
  readonly workflowExecutionPlan?: WorkflowExecutionPlan;
  readonly governanceExecutionPlan?: GovernanceExecutionPlan;
  readonly promptMetadata?: PromptMetadata;
  readonly knowledgeSnapshot?: KnowledgeSnapshot;
  readonly topN?: number;
  readonly maxContextItems?: number;
  readonly mode?: import("./enums").InjectionMode;
  readonly conflictStrategy?: import("./enums").ConflictResolutionStrategy;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
