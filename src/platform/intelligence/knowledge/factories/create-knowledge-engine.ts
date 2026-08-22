/**
 * Factory for KnowledgeIntelligenceEngine with placeholder sources.
 */

import { InMemoryKnowledgeCache } from "../caching/in-memory-knowledge-cache";
import { KnowledgeIntelligenceEngine } from "../engine/knowledge-intelligence-engine";
import { KnowledgeFilterEngine } from "../filtering/knowledge-filter";
import type { IKnowledgeIntelligenceEngine } from "../interfaces/knowledge-ports";
import { KnowledgePermissionEngine } from "../permissions/permission-engine";
import { resolveRankingStrategy } from "../ranking/ranking-strategies";
import { KnowledgeRetriever } from "../retrieval/knowledge-retriever";
import {
  createDefaultPlaceholderSources,
} from "../sources/placeholder-source";
import { createProductChunkKnowledgeSource } from "../sources/product-chunk-source";
import type { IKnowledgeSource } from "../interfaces/knowledge-ports";
import { KnowledgeSourceResolver } from "../sources/source-resolver";

export interface CreateKnowledgeEngineOptions {
  readonly rankingStrategy?: "semantic" | "keyword" | "freshness" | "brand" | "hybrid";
  readonly enableCache?: boolean;
  /** Explicit knowledge sources (tests / overrides). */
  readonly sources?: readonly IKnowledgeSource[];
}

export function createKnowledgeIntelligenceEngine(
  options: CreateKnowledgeEngineOptions & {
    /** Test-only: include PlaceholderKnowledgeSource documents. Default false (Phase 3). */
    readonly usePlaceholders?: boolean;
    /** LIVE: read indexed product knowledge_chunks (Mongo). */
    readonly useProductChunks?: boolean;
  } = {}
): IKnowledgeIntelligenceEngine {
  const sources: IKnowledgeSource[] = [...(options.sources ?? [])];
  if (options.usePlaceholders) {
    sources.push(...createDefaultPlaceholderSources());
  } else if (options.useProductChunks) {
    sources.push(createProductChunkKnowledgeSource());
  }

  return new KnowledgeIntelligenceEngine({
    sourceResolver: new KnowledgeSourceResolver(sources),
    permissionEngine: new KnowledgePermissionEngine(),
    retriever: new KnowledgeRetriever(sources),
    filterEngine: new KnowledgeFilterEngine(),
    rankingStrategy: resolveRankingStrategy(options.rankingStrategy ?? "hybrid"),
    cache:
      options.enableCache === false
        ? undefined
        : new InMemoryKnowledgeCache(),
  });
}
