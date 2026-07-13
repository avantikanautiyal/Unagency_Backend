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
import { KnowledgeSourceResolver } from "../sources/source-resolver";

export interface CreateKnowledgeEngineOptions {
  readonly rankingStrategy?: "semantic" | "keyword" | "freshness" | "brand" | "hybrid";
  readonly enableCache?: boolean;
}

export function createKnowledgeIntelligenceEngine(
  options: CreateKnowledgeEngineOptions = {}
): IKnowledgeIntelligenceEngine {
  const sources = createDefaultPlaceholderSources();

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
