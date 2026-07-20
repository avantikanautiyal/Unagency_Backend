/**
 * Knowledge graph entity / relationship / snapshot contracts.
 */

import type {
  KnowledgeConfidenceBand,
  KnowledgeEntityType,
  KnowledgeRelationshipType,
} from "./enums";

export interface KnowledgeEntity {
  readonly entityId: string;
  readonly organizationId: string;
  readonly type: KnowledgeEntityType;
  readonly name: string;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly tags: readonly string[];
  readonly confidence: number;
  readonly sourceRefs: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface KnowledgeRelationship {
  readonly relationshipId: string;
  readonly organizationId: string;
  readonly type: KnowledgeRelationshipType;
  readonly fromEntityId: string;
  readonly toEntityId: string;
  readonly weight: number;
  readonly confidence: number;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly version: number;
  readonly createdAt: string;
  readonly changelog: string;
}

export interface KnowledgeGraphSnapshot {
  readonly snapshotId: string;
  readonly organizationId: string;
  readonly version: number;
  readonly brandBrainVersion?: number;
  readonly entities: readonly KnowledgeEntity[];
  readonly relationships: readonly KnowledgeRelationship[];
  readonly createdAt: string;
  readonly changelog: string;
}

export interface KnowledgeGraphDiff {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly entitiesAdded: readonly string[];
  readonly entitiesRemoved: readonly string[];
  readonly relationshipsAdded: readonly string[];
  readonly relationshipsRemoved: readonly string[];
  readonly relationshipsUpdated: readonly string[];
}

export interface KnowledgePathHop {
  readonly fromEntityId: string;
  readonly toEntityId: string;
  readonly relationshipId: string;
  readonly relationshipType: KnowledgeRelationshipType;
  readonly weight: number;
}

export interface KnowledgePath {
  readonly hops: readonly KnowledgePathHop[];
  readonly totalWeight: number;
  readonly length: number;
}

export type {
  KnowledgeConfidenceBand,
  KnowledgeEntityType,
  KnowledgeRelationshipType,
};
