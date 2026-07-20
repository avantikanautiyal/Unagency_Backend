/**
 * Artifact chain contracts — immutable stage outputs.
 */

import type { TaskIntelligenceReport } from "../../task-intelligence/contracts/result";
import type { AgentPlanningReport } from "../../agent-planning/contracts/result";
import type { WorkflowIntelligenceReport } from "../../workflow-intelligence/contracts/result";
import type { GovernanceReport } from "../../execution-governance/contracts/result";
import type { ExecutionIntelligenceResult } from "../../execution-intelligence/contracts/result";
import type { ModelIntelligenceResult } from "../../model-intelligence/contracts/result";
import type { NegotiationResult } from "../../providers/negotiation/contracts/negotiation-result";
import type { RoutingDecision } from "../../providers/routing/contracts/plan";

export interface TaskArtifact {
  readonly artifactId: string;
  readonly report: TaskIntelligenceReport;
  readonly createdAt: string;
}

export interface TeamArtifact {
  readonly artifactId: string;
  readonly report: AgentPlanningReport;
  readonly createdAt: string;
}

export interface WorkflowArtifact {
  readonly artifactId: string;
  readonly report: WorkflowIntelligenceReport;
  readonly createdAt: string;
}

export interface GovernanceArtifact {
  readonly artifactId: string;
  readonly report: GovernanceReport;
  readonly createdAt: string;
}

export interface ExecutionIntelligenceArtifact {
  readonly artifactId: string;
  readonly result: ExecutionIntelligenceResult;
  readonly createdAt: string;
}

export interface ModelDecisionArtifact {
  readonly artifactId: string;
  readonly result: ModelIntelligenceResult;
  readonly createdAt: string;
}

export interface NegotiationArtifact {
  readonly artifactId: string;
  readonly result: NegotiationResult;
  readonly createdAt: string;
}

export interface RoutingArtifact {
  readonly artifactId: string;
  readonly decision: RoutingDecision;
  readonly createdAt: string;
}

export interface ExecutionReadyArtifact {
  readonly artifactId: string;
  readonly planId: string;
  readonly createdAt: string;
}

export interface ArtifactChain {
  readonly task?: TaskArtifact;
  readonly team?: TeamArtifact;
  readonly workflow?: WorkflowArtifact;
  readonly governance?: GovernanceArtifact;
  readonly executionIntelligence?: ExecutionIntelligenceArtifact;
  readonly modelDecision?: ModelDecisionArtifact;
  readonly negotiation?: NegotiationArtifact;
  readonly routing?: RoutingArtifact;
  readonly executionReady?: ExecutionReadyArtifact;
}
