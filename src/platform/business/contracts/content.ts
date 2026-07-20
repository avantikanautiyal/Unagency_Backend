/**
 * Brand, campaign, asset, knowledge contracts.
 */

import type { CampaignChannel, CampaignStatus, KnowledgeDocKind } from "./enums";

export interface BrandProfile {
  readonly brandId: string;
  readonly organizationId: string;
  readonly workspaceId?: string;
  readonly name: string;
  readonly toneOfVoice: string;
  readonly visualIdentity: string;
  readonly brandRules: readonly string[];
  readonly colorPalette: readonly string[];
  readonly typography: readonly string[];
  readonly logoAssetIds: readonly string[];
  readonly brandAssetIds: readonly string[];
  readonly brandMemoryRefs: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Campaign {
  readonly campaignId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly projectId?: string;
  readonly brandId?: string;
  readonly name: string;
  readonly objective: string;
  readonly channels: readonly CampaignChannel[];
  readonly deliverables: readonly string[];
  readonly status: CampaignStatus;
  readonly scheduledAt?: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly analyticsTags: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Asset {
  readonly assetId: string;
  readonly organizationId: string;
  readonly workspaceId?: string;
  readonly name: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly storageKey: string;
  readonly tags: readonly string[];
  readonly createdAt: string;
}

export interface KnowledgeRepository {
  readonly repositoryId: string;
  readonly organizationId: string;
  readonly workspaceId?: string;
  readonly name: string;
  readonly createdAt: string;
}

export interface KnowledgeDocument {
  readonly documentId: string;
  readonly repositoryId: string;
  readonly organizationId: string;
  readonly title: string;
  readonly kind: KnowledgeDocKind;
  readonly body: string;
  readonly version: number;
  readonly searchKeywords: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PromptTemplate {
  readonly promptId: string;
  readonly organizationId: string;
  readonly name: string;
  readonly body: string;
  readonly tags: readonly string[];
  readonly createdAt: string;
}
