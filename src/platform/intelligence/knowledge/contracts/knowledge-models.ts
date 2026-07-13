/**
 * Knowledge Intelligence Engine core models.
 * Provider-independent, immutable knowledge packaging contracts.
 */

import type {
  CapabilityId,
  OrganizationId,
  UserId,
  WorkspaceId,
} from "../../shared/identifiers";

export type KnowledgeSourceKind =
  | "inline"
  | "mongo"
  | "s3"
  | "pdf"
  | "brand_guideline"
  | "google_drive"
  | "sharepoint"
  | "confluence"
  | "vector"
  | "website"
  | "api"
  | "placeholder";

export interface KnowledgeIdentity {
  readonly organizationId: OrganizationId;
  readonly workspaceId: WorkspaceId;
  readonly userId?: UserId;
  readonly capabilityId?: CapabilityId;
  readonly projectId?: string;
  readonly correlationId?: string;
}

export interface KnowledgeMetadata {
  readonly title?: string;
  readonly tags?: readonly string[];
  readonly language?: string;
  readonly locale?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly expiresAt?: string;
  readonly deprecated?: boolean;
  readonly classification?: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface KnowledgeSource {
  readonly id: string;
  readonly kind: KnowledgeSourceKind;
  readonly name: string;
  readonly available: boolean;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface KnowledgeReference {
  readonly documentId: string;
  readonly sourceId: string;
  readonly uri?: string;
  readonly title?: string;
}

export interface KnowledgeScore {
  readonly relevance: number;
  readonly freshness?: number;
  readonly brandAlignment?: number;
  readonly keyword?: number;
  readonly hybrid?: number;
  readonly final: number;
}

export interface KnowledgeChunk {
  readonly id: string;
  readonly documentId: string;
  readonly content: string;
  readonly ordinal: number;
  readonly score?: KnowledgeScore;
  readonly metadata?: KnowledgeMetadata;
}

export interface KnowledgeDocument {
  readonly id: string;
  readonly sourceId: string;
  readonly content: string;
  readonly chunks: readonly KnowledgeChunk[];
  readonly references?: readonly KnowledgeReference[];
  readonly metadata: KnowledgeMetadata;
  readonly score?: KnowledgeScore;
}

export interface KnowledgeCollection {
  readonly id: string;
  readonly documents: readonly KnowledgeDocument[];
  readonly sources: readonly KnowledgeSource[];
}

export interface KnowledgeFilter {
  readonly maxDocuments?: number;
  readonly maxChunks?: number;
  readonly minRelevance?: number;
  readonly includeTags?: readonly string[];
  readonly excludeTags?: readonly string[];
  readonly excludeDeprecated?: boolean;
  readonly excludeExpired?: boolean;
  readonly requiredPermissions?: readonly string[];
}

export type KnowledgeRankingStrategyName =
  | "semantic"
  | "keyword"
  | "freshness"
  | "brand"
  | "hybrid";

export interface KnowledgeRanking {
  readonly strategy: KnowledgeRankingStrategyName;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface KnowledgePermission {
  readonly organizationId: OrganizationId;
  readonly workspaceId: WorkspaceId;
  readonly projectId?: string;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
  readonly capabilityId?: CapabilityId;
  readonly classification?: string;
}

export interface KnowledgeRequest {
  readonly identity: KnowledgeIdentity;
  readonly query?: string;
  readonly filter?: KnowledgeFilter;
  readonly ranking?: KnowledgeRanking;
  readonly permission: KnowledgePermission;
  readonly sourceKinds?: readonly KnowledgeSourceKind[];
  readonly contextHints?: Readonly<Record<string, unknown>>;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface KnowledgeSnapshot {
  readonly snapshotId: string;
  readonly requestId?: string;
  readonly identity: KnowledgeIdentity;
  readonly documents: readonly KnowledgeDocument[];
  readonly chunks: readonly KnowledgeChunk[];
  readonly sources: readonly KnowledgeSource[];
  readonly references: readonly KnowledgeReference[];
  readonly capturedAt: string;
  readonly checksum?: string;
  readonly metadata?: KnowledgeMetadata;
}

export interface KnowledgeResult {
  readonly snapshot: KnowledgeSnapshot;
  readonly candidateCount: number;
  readonly filteredCount: number;
  readonly sourceCount: number;
}
