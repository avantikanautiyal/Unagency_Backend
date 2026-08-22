/**
 * Tenant-scoped knowledge hit source for Knowledge Intelligence.
 * Never returns demo/placeholder documents.
 */

import type { KnowledgeHit } from "../contracts/knowledge-context";
import { KnowledgeIntelligenceError } from "../contracts/errors";

export interface IKnowledgeHitSource {
  search(input: {
    readonly organizationId: string;
    readonly brandId?: string;
    readonly query: string;
    readonly limit?: number;
  }): Promise<{
    readonly hits: readonly KnowledgeHit[];
    readonly available: boolean;
    readonly failureReason?: string;
  }>;
}

/** In-memory source for tests / simulated harnesses — tenant isolated. */
export class InMemoryKnowledgeHitSource implements IKnowledgeHitSource {
  private readonly byOrg = new Map<string, KnowledgeHit[]>();

  upsert(hit: KnowledgeHit): void {
    if (!hit.organizationId?.trim()) {
      throw new KnowledgeIntelligenceError(
        "KNOWLEDGE_TENANT_VIOLATION",
        "organizationId required on knowledge hit"
      );
    }
    const list = this.byOrg.get(hit.organizationId) ?? [];
    list.push(hit);
    this.byOrg.set(hit.organizationId, list);
  }

  clear(): void {
    this.byOrg.clear();
  }

  /** Test helper — remove all hits for a document within an org. */
  deleteDocument(organizationId: string, documentId: string): void {
    const list = this.byOrg.get(organizationId) ?? [];
    this.byOrg.set(
      organizationId,
      list.filter((h) => h.documentId !== documentId)
    );
  }

  async search(input: {
    readonly organizationId: string;
    readonly brandId?: string;
    readonly query: string;
    readonly limit?: number;
  }): Promise<{
    readonly hits: readonly KnowledgeHit[];
    readonly available: boolean;
  }> {
    const q = input.query.trim().toLowerCase();
    const all = this.byOrg.get(input.organizationId) ?? [];
    const filtered = all.filter((h) => {
      if (h.organizationId !== input.organizationId) return false;
      if (input.brandId && h.brandId && h.brandId !== input.brandId) return false;
      if (!q) return false;
      return (
        h.content.toLowerCase().includes(q) ||
        h.title.toLowerCase().includes(q) ||
        q.split(/\s+/).some((t) => t.length > 2 && h.content.toLowerCase().includes(t))
      );
    });

    const scored = filtered.map((h) => {
      const lower = h.content.toLowerCase();
      const terms = q.split(/\s+/).filter((t) => t.length > 2);
      const hits = terms.reduce(
        (n, t) => n + (lower.includes(t) ? 1 : 0),
        0
      );
      return {
        ...h,
        retrievalScore: Math.min(100, 40 + hits * 15),
        retrievalMethod: "memory" as const,
      };
    });
    scored.sort((a, b) => b.retrievalScore - a.retrievalScore);
    return {
      available: true,
      hits: scored.slice(0, input.limit ?? 8),
    };
  }
}

/**
 * Product Mongo knowledge_chunks — org-scoped at the query boundary.
 */
export class ProductKnowledgeHitSource implements IKnowledgeHitSource {
  async search(input: {
    readonly organizationId: string;
    readonly brandId?: string;
    readonly query: string;
    readonly limit?: number;
  }): Promise<{
    readonly hits: readonly KnowledgeHit[];
    readonly available: boolean;
    readonly failureReason?: string;
  }> {
    try {
      const mongooseNs = await import("mongoose");
      const mongoose =
        (mongooseNs as { default?: typeof mongooseNs }).default ?? mongooseNs;
      if (mongoose.connection?.readyState !== 1) {
        return {
          hits: [],
          available: false,
          failureReason: "KNOWLEDGE_STORE_UNAVAILABLE: mongo_not_connected",
        };
      }
      if (!mongoose.isValidObjectId(input.organizationId)) {
        return { hits: [], available: true };
      }

      const { searchKnowledgeChunksDetailed } = await import(
        "../../../../services/knowledge-document-index-service"
      );
      const hits = await searchKnowledgeChunksDetailed({
        organizationId: input.organizationId,
        brandId: input.brandId,
        q: input.query,
        limit: input.limit ?? 8,
      });
      return { hits, available: true };
    } catch (err) {
      return {
        hits: [],
        available: false,
        failureReason: `KNOWLEDGE_STORE_UNAVAILABLE: ${
          err instanceof Error ? err.message : "unknown"
        }`,
      };
    }
  }
}

export function createProductKnowledgeHitSource(): IKnowledgeHitSource {
  return new ProductKnowledgeHitSource();
}
