/**
 * Applicability conditions — WHERE an experience applies.
 */

import type { CapabilityId, OrganizationId, WorkspaceId } from "../../shared/identifiers";

export interface ApplicabilityConditions {
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
  readonly locale?: string;
  readonly organizationId?: OrganizationId;
  readonly workspaceId?: WorkspaceId;
  readonly campaignId?: string;
  readonly projectId?: string;
  readonly complexityTier?: string;
  readonly budgetTier?: string;
}
