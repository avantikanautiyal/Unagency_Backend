/**
 * Delegation and escalation contracts.
 */

import type { AgentId } from "./identifiers";
import type { EscalationLevel } from "./enums";
import type { TaskNodeId } from "../../task-intelligence/contracts/identifiers";

export interface DelegationRule {
  readonly ruleId: string;
  readonly fromAgentId: AgentId;
  readonly toAgentId: AgentId;
  readonly taskNodeId: TaskNodeId;
  readonly condition: string;
}

export interface DelegationPlan {
  readonly planId: string;
  readonly rules: readonly DelegationRule[];
  readonly rationale: string;
}

export interface EscalationPath {
  readonly pathId: string;
  readonly fromAgentId: AgentId;
  readonly levels: readonly EscalationLevel[];
  readonly ownerRole: string;
  readonly rationale: string;
}

export interface EscalationPlan {
  readonly planId: string;
  readonly paths: readonly EscalationPath[];
  readonly retryOwnership: Readonly<Record<string, string>>;
  readonly rationale: string;
}
