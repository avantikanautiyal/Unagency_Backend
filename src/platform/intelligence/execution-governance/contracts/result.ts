/**
 * Governance result contracts.
 */

import type { GovernanceResultId } from "./identifiers";
import type { GovernanceRequest } from "./request";
import type { GovernanceExecutionPlan } from "./plan";
import type { GovernanceExplanation } from "./explainability";

export interface GovernanceStatistics {
  readonly policiesEvaluated: number;
  readonly risksIdentified: number;
  readonly approvalsRequired: number;
  readonly durationMs: number;
}

export interface GovernanceReport {
  readonly resultId: GovernanceResultId;
  readonly request: GovernanceRequest;
  readonly governanceExecutionPlan: GovernanceExecutionPlan;
  readonly explanation: GovernanceExplanation;
  readonly statistics: GovernanceStatistics;
  readonly createdAt: string;
}
