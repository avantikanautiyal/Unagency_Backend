/**
 * Agent Planning request contract.
 */

import type { StructuredTaskPlan } from "../../task-intelligence/contracts/planning";

export interface AgentPlanningRequest {
  readonly requestId: string;
  readonly structuredTaskPlan: StructuredTaskPlan;
  readonly scenarioHint?: string;
  readonly preferredTeamPlaybook?: string;
  readonly maxAgents?: number;
}
