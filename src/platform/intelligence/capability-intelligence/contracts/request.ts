/**
 * Capability Intelligence request — reuses frozen plan/snapshot contracts as optional inputs.
 */

import type { StructuredTaskPlan } from "../../task-intelligence/contracts/planning";
import type { ExecutionTeamPlan } from "../../agent-planning/contracts/team-plan";
import type { WorkflowExecutionPlan } from "../../workflow-intelligence/contracts/plan";
import type { GovernanceExecutionPlan } from "../../execution-governance/contracts/plan";
import type { ExecutionIntelligenceResult } from "../../execution-intelligence/contracts/result";
import type { ExecutionExperiencePackage } from "../../experience-injection/contracts/package";
import type { KnowledgeSnapshot } from "../../knowledge/contracts/knowledge-models";
import type { ContextSnapshot } from "../../context/contracts/intelligence-context";
import type { CapabilityDepartment, ComplexityTier } from "./enums";

export interface CapabilityDiscoveryHints {
  readonly department?: CapabilityDepartment;
  readonly industry?: string;
  readonly taskHints?: readonly string[];
  readonly workflowHints?: readonly string[];
  readonly providerSupport?: readonly string[];
  readonly modelSupport?: readonly string[];
  readonly complexity?: ComplexityTier;
  readonly keywords?: readonly string[];
}

/**
 * Business objective is the primary input. Plans/snapshots are optional enrichment.
 * Note: platform uses ExecutionIntelligenceResult (no ExecutionIntelligencePlan type).
 * ExperiencePackage maps to ExecutionExperiencePackage.
 */
export interface CapabilityIntelligenceRequest {
  readonly requestId: string;
  readonly businessObjective: string;
  readonly discovery?: CapabilityDiscoveryHints;
  readonly preferredCapabilityIds?: readonly string[];
  readonly taskPlan?: StructuredTaskPlan;
  readonly teamPlan?: ExecutionTeamPlan;
  readonly workflowPlan?: WorkflowExecutionPlan;
  readonly governancePlan?: GovernanceExecutionPlan;
  readonly executionIntelligence?: ExecutionIntelligenceResult;
  readonly experiencePackage?: ExecutionExperiencePackage;
  readonly knowledgeSnapshot?: KnowledgeSnapshot;
  readonly contextSnapshot?: ContextSnapshot;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
