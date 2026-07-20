/**
 * ExecutionReadyPlan — final control plane output.
 */

import type { ExecutionReadyPlanId } from "./identifiers";
import type { StructuredTaskPlan } from "../../task-intelligence/contracts/planning";
import type { ExecutionTeamPlan } from "../../agent-planning/contracts/team-plan";
import type { WorkflowExecutionPlan } from "../../workflow-intelligence/contracts/plan";
import type { GovernanceExecutionPlan } from "../../execution-governance/contracts/plan";
import type { ExecutionIntelligenceResult } from "../../execution-intelligence/contracts/result";
import type { RankedModelCandidates } from "../../model-intelligence/contracts/recommendation";
import type { NegotiationResult } from "../../providers/negotiation/contracts/negotiation-result";
import type { RoutingDecision } from "../../providers/routing/contracts/plan";
import type { PipelineDiagnostics } from "./diagnostics";
import type { UnifiedExplanation } from "./explainability";
import type { ArtifactChain } from "./artifacts";

export interface ExecutionReadyPlan {
  readonly planId: ExecutionReadyPlanId;
  readonly requestId: string;
  readonly structuredTaskPlan: StructuredTaskPlan;
  readonly executionTeamPlan: ExecutionTeamPlan;
  readonly workflowExecutionPlan: WorkflowExecutionPlan;
  readonly governanceExecutionPlan: GovernanceExecutionPlan;
  readonly executionIntelligenceResult: ExecutionIntelligenceResult;
  readonly rankedModelCandidates: RankedModelCandidates;
  readonly negotiationResult: NegotiationResult;
  readonly routingDecision: RoutingDecision;
  readonly executionConstraints: readonly string[];
  readonly diagnostics: PipelineDiagnostics;
  readonly explanation: UnifiedExplanation;
  readonly artifacts: ArtifactChain;
  readonly authorized: boolean;
  readonly version: string;
  readonly createdAt: string;
}
