/**
 * Knowledge Intelligence Engine ports.
 *
 * Purpose: Define provider-independent knowledge discovery and packaging.
 * Responsibilities: Sources, retrieval, ranking, filtering, permissions, cache, index, engine.
 * Usage: Injected into KnowledgeIntelligenceEngine.
 * Future Extension: Mongo/S3/vector adapters behind these ports.
 */

import type { Result } from "../../shared/result";
import type {
  KnowledgeDocument,
  KnowledgeFilter,
  KnowledgeRanking,
  KnowledgeRankingStrategyName,
  KnowledgeRequest,
  KnowledgeResult,
  KnowledgeSnapshot,
  KnowledgeSource,
  KnowledgeSourceKind,
} from "../contracts/knowledge-models";

/**
 * Exposes knowledge from a single logical source.
 * Does not perform ranking or permission decisions.
 */
export interface IKnowledgeSource {
  readonly id: string;
  readonly kind: KnowledgeSourceKind;
  readonly name: string;
  isAvailable(): Promise<boolean>;
  listDocuments(
    request: KnowledgeRequest
  ): Promise<Result<readonly KnowledgeDocument[]>>;
}

/**
 * Resolves which sources are candidates for a request.
 */
export interface IKnowledgeSourceResolver {
  resolve(request: KnowledgeRequest): Promise<Result<readonly KnowledgeSource[]>>;
}

/**
 * Retrieves candidate documents from resolved sources.
 */
export interface IKnowledgeRetriever {
  retrieve(
    request: KnowledgeRequest,
    sources: readonly KnowledgeSource[]
  ): Promise<Result<readonly KnowledgeDocument[]>>;
}

/**
 * Ranks documents (placeholder strategies only).
 */
export interface IKnowledgeRankingStrategy {
  readonly name: KnowledgeRankingStrategyName;
  rank(
    documents: readonly KnowledgeDocument[],
    ranking?: KnowledgeRanking
  ): Promise<Result<readonly KnowledgeDocument[]>>;
}

/**
 * Filters documents by policy/relevance/expiry.
 */
export interface IKnowledgeFilterEngine {
  filter(
    documents: readonly KnowledgeDocument[],
    filter?: KnowledgeFilter,
    nowIso?: string
  ): Promise<Result<readonly KnowledgeDocument[]>>;
}

/**
 * Validates access before knowledge is returned.
 */
export interface IKnowledgePermissionEngine {
  authorize(request: KnowledgeRequest): Promise<Result<void>>;
  filterAuthorized(
    request: KnowledgeRequest,
    documents: readonly KnowledgeDocument[]
  ): Promise<Result<readonly KnowledgeDocument[]>>;
}

/**
 * Future index ports — interfaces only.
 */
export interface IKnowledgeIndex {
  readonly kind: "vector" | "keyword" | "metadata" | "hybrid";
}

export interface IVectorKnowledgeIndex extends IKnowledgeIndex {
  readonly kind: "vector";
}

export interface IKeywordKnowledgeIndex extends IKnowledgeIndex {
  readonly kind: "keyword";
}

export interface IMetadataKnowledgeIndex extends IKnowledgeIndex {
  readonly kind: "metadata";
}

export interface IHybridKnowledgeIndex extends IKnowledgeIndex {
  readonly kind: "hybrid";
}

/**
 * In-memory knowledge cache port.
 */
export interface IKnowledgeCache {
  get(key: string): Promise<KnowledgeSnapshot | undefined>;
  set(key: string, snapshot: KnowledgeSnapshot, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Knowledge Intelligence Engine.
 */
export interface IKnowledgeIntelligenceEngine {
  query(request: KnowledgeRequest): Promise<Result<KnowledgeResult>>;
  snapshot(request: KnowledgeRequest): Promise<Result<KnowledgeSnapshot>>;
}
