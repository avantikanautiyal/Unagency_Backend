/**
 * Placeholder ranking strategies — architecture only, no real algorithms.
 */

import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type {
  KnowledgeDocument,
  KnowledgeRanking,
  KnowledgeRankingStrategyName,
  KnowledgeScore,
} from "../contracts/knowledge-models";
import type { IKnowledgeRankingStrategy } from "../interfaces/knowledge-ports";

function withScore(
  document: KnowledgeDocument,
  score: KnowledgeScore
): KnowledgeDocument {
  return {
    ...document,
    score,
    chunks: document.chunks.map((chunk) => ({ ...chunk, score })),
  };
}

function sortByFinal(
  documents: readonly KnowledgeDocument[]
): KnowledgeDocument[] {
  return [...documents].sort(
    (a, b) => (b.score?.final ?? 0) - (a.score?.final ?? 0)
  );
}

abstract class BaseRankingStrategy implements IKnowledgeRankingStrategy {
  abstract readonly name: KnowledgeRankingStrategyName;

  abstract score(document: KnowledgeDocument): KnowledgeScore;

  async rank(
    documents: readonly KnowledgeDocument[],
    _ranking?: KnowledgeRanking
  ): Promise<Result<readonly KnowledgeDocument[]>> {
    const ranked = sortByFinal(documents.map((d) => withScore(d, this.score(d))));
    return success(ranked);
  }
}

export class SemanticRankingStrategy extends BaseRankingStrategy {
  readonly name = "semantic" as const;
  score(document: KnowledgeDocument): KnowledgeScore {
    const relevance = Math.min(1, document.content.length / 200);
    return { relevance, final: relevance };
  }
}

export class KeywordRankingStrategy extends BaseRankingStrategy {
  readonly name = "keyword" as const;
  score(document: KnowledgeDocument): KnowledgeScore {
    const keyword = document.metadata.tags?.length
      ? Math.min(1, document.metadata.tags.length / 5)
      : 0.1;
    return { relevance: keyword, keyword, final: keyword };
  }
}

export class FreshnessRankingStrategy extends BaseRankingStrategy {
  readonly name = "freshness" as const;
  score(document: KnowledgeDocument): KnowledgeScore {
    const updatedAt = document.metadata.updatedAt
      ? Date.parse(document.metadata.updatedAt)
      : 0;
    const freshness = updatedAt > 0 ? Math.min(1, updatedAt / Date.now()) : 0.1;
    return { relevance: freshness, freshness, final: freshness };
  }
}

export class BrandRankingStrategy extends BaseRankingStrategy {
  readonly name = "brand" as const;
  score(document: KnowledgeDocument): KnowledgeScore {
    const brandAlignment = document.metadata.tags?.includes("brand") ? 1 : 0.2;
    return { relevance: brandAlignment, brandAlignment, final: brandAlignment };
  }
}

export class HybridRankingStrategy extends BaseRankingStrategy {
  readonly name = "hybrid" as const;
  score(document: KnowledgeDocument): KnowledgeScore {
    const semantic = Math.min(1, document.content.length / 200);
    const keyword = document.metadata.tags?.length
      ? Math.min(1, document.metadata.tags.length / 5)
      : 0.1;
    const brandAlignment = document.metadata.tags?.includes("brand") ? 1 : 0.2;
    const final = (semantic + keyword + brandAlignment) / 3;
    return { relevance: semantic, keyword, brandAlignment, hybrid: final, final };
  }
}

export function resolveRankingStrategy(
  name: KnowledgeRankingStrategyName = "hybrid"
): IKnowledgeRankingStrategy {
  switch (name) {
    case "semantic":
      return new SemanticRankingStrategy();
    case "keyword":
      return new KeywordRankingStrategy();
    case "freshness":
      return new FreshnessRankingStrategy();
    case "brand":
      return new BrandRankingStrategy();
    case "hybrid":
    default:
      return new HybridRankingStrategy();
  }
}
