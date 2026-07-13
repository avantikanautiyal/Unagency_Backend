/**
 * Placeholder knowledge filter.
 */

import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type {
  KnowledgeDocument,
  KnowledgeFilter,
} from "../contracts/knowledge-models";
import type { IKnowledgeFilterEngine } from "../interfaces/knowledge-ports";

export class KnowledgeFilterEngine implements IKnowledgeFilterEngine {
  async filter(
    documents: readonly KnowledgeDocument[],
    filter?: KnowledgeFilter,
    nowIso: string = new Date().toISOString()
  ): Promise<Result<readonly KnowledgeDocument[]>> {
    const now = Date.parse(nowIso);
    let result = [...documents];

    // Remove duplicates by id
    const seen = new Set<string>();
    result = result.filter((doc) => {
      if (seen.has(doc.id)) return false;
      seen.add(doc.id);
      return true;
    });

    if (filter?.excludeDeprecated !== false) {
      result = result.filter((doc) => doc.metadata.deprecated !== true);
    }

    if (filter?.excludeExpired !== false) {
      result = result.filter((doc) => {
        if (!doc.metadata.expiresAt) return true;
        const expires = Date.parse(doc.metadata.expiresAt);
        return !Number.isFinite(expires) || expires > now;
      });
    }

    if (filter?.includeTags?.length) {
      const required = new Set(filter.includeTags);
      result = result.filter((doc) =>
        doc.metadata.tags?.some((tag) => required.has(tag))
      );
    }

    if (filter?.excludeTags?.length) {
      const excluded = new Set(filter.excludeTags);
      result = result.filter(
        (doc) => !doc.metadata.tags?.some((tag) => excluded.has(tag))
      );
    }

    if (filter?.minRelevance !== undefined) {
      result = result.filter(
        (doc) => (doc.score?.final ?? 0) >= (filter.minRelevance ?? 0)
      );
    }

    if (filter?.maxDocuments !== undefined) {
      result = result.slice(0, filter.maxDocuments);
    }

    if (filter?.maxChunks !== undefined) {
      result = result.map((doc) => ({
        ...doc,
        chunks: doc.chunks.slice(0, filter.maxChunks),
      }));
    }

    return success(result);
  }
}
