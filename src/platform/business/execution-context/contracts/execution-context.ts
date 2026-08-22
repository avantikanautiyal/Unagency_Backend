/**
 * Execution business context contracts — provider-independent intelligence boundary.
 */

import type { ContextBuildRequest } from "../../../intelligence/context/contracts/context-build-request";
import type { BrandBrainEnrichmentPackage } from "../../brand-brain/contracts";
import type { KnowledgeContextPackage } from "../../knowledge-intelligence/contracts";

export interface ExecutionContextIdentity {
  readonly userId: string;
  readonly organizationId: string;
  readonly workspaceId?: string;
  readonly roles?: readonly string[];
  readonly permissions?: readonly string[];
}

export interface ExecutionContextScope {
  readonly brandId?: string;
  readonly projectId?: string;
  readonly campaignId?: string;
  readonly clientId?: string;
  readonly requirementId?: string;
  readonly taskId?: string;
}

export interface ExecutionContextResolveInput {
  readonly requestId: string;
  readonly correlationId?: string;
  readonly rawPrompt: string;
  readonly capabilityId?: string;
  readonly identity: ExecutionContextIdentity;
  readonly scope?: ExecutionContextScope;
  readonly hints?: Readonly<{
    language?: string;
    locale?: string;
    region?: string;
    department?: string;
  }>;
}

export interface ExecutionOrganizationContext {
  readonly organizationId: string;
  readonly name?: string;
  readonly industry?: string;
  readonly status?: string;
}

export interface ExecutionUserContext {
  readonly userId: string;
  readonly email?: string;
  readonly displayName?: string;
  readonly legacyRole?: string;
}

export interface ExecutionBrandContext {
  readonly brandId: string;
  readonly name: string;
  readonly toneOfVoice?: string;
  readonly visualIdentity?: string;
  readonly brandRules?: readonly string[];
  readonly colorPalette?: readonly string[];
}

export interface ExecutionProjectContext {
  readonly projectId: string;
  readonly name: string;
  readonly status?: string;
  readonly brandId?: string;
}

export interface ExecutionCampaignContext {
  readonly campaignId: string;
  readonly name: string;
  readonly objective?: string;
  readonly channels?: readonly string[];
  readonly brandId?: string;
  readonly projectId?: string;
}

export interface ExecutionClientContext {
  readonly clientId: string;
  readonly displayName?: string;
  readonly email?: string;
}

export interface ExecutionPolicyContext {
  readonly policyIds: readonly string[];
  readonly rules: readonly string[];
  readonly constraints: readonly string[];
}

export interface ExecutionBusinessContext {
  readonly identity: ExecutionContextIdentity;
  readonly organization: ExecutionOrganizationContext;
  readonly user: ExecutionUserContext;
  readonly brand?: ExecutionBrandContext;
  readonly project?: ExecutionProjectContext;
  readonly campaign?: ExecutionCampaignContext;
  readonly client?: ExecutionClientContext;
  readonly policy?: ExecutionPolicyContext;
  readonly completeness: Readonly<{
    organization: boolean;
    user: boolean;
    brand: boolean;
    project: boolean;
    campaign: boolean;
    client: boolean;
    policy: boolean;
  }>;
}

export interface ExecutionContextTrace {
  readonly contextSnapshotId: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly brandId?: string;
  readonly brandSnapshotId?: string;
  readonly brandBrainVersion?: number;
  readonly knowledgeSnapshotId?: string;
  readonly knowledgeGraphVersion?: number;
  readonly projectId?: string;
  readonly campaignId?: string;
  readonly providerTimingsMs: Readonly<Record<string, number>>;
  readonly completeness: ExecutionBusinessContext["completeness"];
}

export interface ResolvedExecutionContextBundle {
  readonly business: ExecutionBusinessContext;
  readonly contextBuildRequest: ContextBuildRequest;
  readonly brandEnrichment?: BrandBrainEnrichmentPackage;
  readonly businessKnowledge?: KnowledgeContextPackage;
  readonly trace: ExecutionContextTrace;
}
