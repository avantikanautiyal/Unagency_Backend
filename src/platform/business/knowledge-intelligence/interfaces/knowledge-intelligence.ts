/**
 * Knowledge Intelligence public interfaces.
 */

import type { Result } from "../../../intelligence/shared/result";
import type { BrandBrainDocument } from "../../brand-brain/contracts";
import type {
  KnowledgeContextPackage,
  KnowledgeEntity,
  KnowledgeGraphDiff,
  KnowledgeGraphSnapshot,
  KnowledgePath,
  KnowledgeRelationship,
  KnowledgeRetrievalQuery,
} from "../contracts";

export interface UpsertEntityInput {
  readonly organizationId: string;
  readonly entity: Omit<KnowledgeEntity, "createdAt" | "updatedAt"> & {
    readonly createdAt?: string;
    readonly updatedAt?: string;
  };
  readonly changelog: string;
}

export interface UpsertRelationshipInput {
  readonly organizationId: string;
  readonly relationship: Omit<
    KnowledgeRelationship,
    "version" | "createdAt" | "changelog"
  > & {
    readonly createdAt?: string;
  };
  readonly changelog: string;
}

export interface SyncFromBrandBrainInput {
  readonly organizationId: string;
  readonly document: BrandBrainDocument;
  readonly brandBrainVersion: number;
  readonly changelog?: string;
}

export interface TraversalOptions {
  readonly maxDepth?: number;
  readonly relationshipTypes?: readonly string[];
}

export interface IKnowledgeIntelligenceEngine {
  /** Project Brand Brain (SoT) into the knowledge graph. */
  syncFromBrandBrain(input: SyncFromBrandBrainInput): Result<KnowledgeGraphSnapshot>;

  upsertEntity(input: UpsertEntityInput): Result<KnowledgeEntity>;
  upsertRelationship(input: UpsertRelationshipInput): Result<KnowledgeRelationship>;

  getEntity(organizationId: string, entityId: string): Result<KnowledgeEntity | undefined>;
  listEntities(
    organizationId: string,
    type?: string
  ): Result<readonly KnowledgeEntity[]>;
  listRelationships(
    organizationId: string
  ): Result<readonly KnowledgeRelationship[]>;

  getCurrentSnapshot(
    organizationId: string
  ): Result<KnowledgeGraphSnapshot | undefined>;
  getSnapshot(
    organizationId: string,
    version: number
  ): Result<KnowledgeGraphSnapshot | undefined>;
  listSnapshots(
    organizationId: string
  ): Result<readonly KnowledgeGraphSnapshot[]>;
  compare(
    organizationId: string,
    fromVersion: number,
    toVersion: number
  ): Result<KnowledgeGraphDiff>;

  relatedEntities(
    organizationId: string,
    entityId: string,
    options?: TraversalOptions
  ): Result<readonly KnowledgeEntity[]>;
  shortestPath(
    organizationId: string,
    fromEntityId: string,
    toEntityId: string
  ): Result<KnowledgePath | undefined>;
  neighborhood(
    organizationId: string,
    entityId: string,
    depth?: number
  ): Result<{
    readonly entities: readonly KnowledgeEntity[];
    readonly relationships: readonly KnowledgeRelationship[];
  }>;

  /** Assemble structured context for an execution request. */
  assembleContext(query: KnowledgeRetrievalQuery): Result<KnowledgeContextPackage>;

  toExecutionMetadata(
    pack: KnowledgeContextPackage
  ): Readonly<Record<string, unknown>>;
}
