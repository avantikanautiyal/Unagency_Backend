/**
 * Approval and quality gate contracts.
 */

import type { ApprovalKind, ApprovalStatus, QualityGateKind } from "./enums";

export interface ApprovalRequirement {
  readonly requirementId: string;
  readonly kind: ApprovalKind;
  readonly status: ApprovalStatus;
  readonly description: string;
  readonly dependsOn?: readonly string[];
  readonly blocking: boolean;
  readonly rationale: string;
}

export interface GovernanceApprovalPlan {
  readonly planId: string;
  readonly requirements: readonly ApprovalRequirement[];
  readonly allApproved: boolean;
  readonly pendingApprovals: readonly ApprovalKind[];
  readonly rationale: string;
}

export interface QualityGateResult {
  readonly gateId: string;
  readonly kind: QualityGateKind;
  readonly passed: boolean;
  readonly threshold?: number;
  readonly actual?: number;
  readonly message: string;
}

export interface QualityGateReport {
  readonly reportId: string;
  readonly gates: readonly QualityGateResult[];
  readonly allPassed: boolean;
  readonly rationale: string;
}
