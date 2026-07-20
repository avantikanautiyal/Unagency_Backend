/**
 * Workflow Intelligence request contract.
 */

import type { ExecutionTeamPlan } from "../../agent-planning/contracts/team-plan";

export interface WorkflowIntelligenceRequest {
  readonly requestId: string;
  readonly executionTeamPlan: ExecutionTeamPlan;
  readonly scenarioHint?: string;
  readonly maxConcurrency?: number;
}
