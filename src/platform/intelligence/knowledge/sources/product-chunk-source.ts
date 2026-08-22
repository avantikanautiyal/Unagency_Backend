/**
 * Product knowledge_chunks source for Intelligence Knowledge Engine (PromptCompiler path).
 */

import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type {
  KnowledgeDocument,
  KnowledgeRequest,
  KnowledgeSourceKind,
} from "../contracts/knowledge-models";
import type { IKnowledgeSource } from "../interfaces/knowledge-ports";

export class ProductChunkKnowledgeSource implements IKnowledgeSource {
  readonly id = "source_product_chunks";
  readonly kind: KnowledgeSourceKind = "mongo";
  readonly name = "Product Knowledge Chunks";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async listDocuments(
    request: KnowledgeRequest
  ): Promise<Result<readonly KnowledgeDocument[]>> {
    const organizationId = String(request.identity.organizationId ?? "");
    const query =
      request.query?.trim() ||
      (typeof request.contextHints?.message === "string"
        ? request.contextHints.message
        : "") ||
      (typeof request.contextHints?.task === "string"
        ? request.contextHints.task
        : "");

    if (!organizationId || !query.trim()) {
      return success([]);
    }

    try {
      const { searchKnowledgeChunksDetailed } = await import(
        "../../../../services/knowledge-document-index-service"
      );
      const brandId =
        typeof request.contextHints?.brandId === "string"
          ? request.contextHints.brandId
          : undefined;
      const hits = await searchKnowledgeChunksDetailed({
        organizationId,
        brandId,
        q: query,
        limit: request.filter?.maxDocuments ?? 8,
      });

      const byAsset = new Map<string, KnowledgeDocument>();
      for (const hit of hits) {
        const docId = hit.documentId;
        const existing = byAsset.get(docId);
        const ordinalMatch = hit.chunkId.match(/#(\d+)$/);
        const chunk = {
          id: hit.chunkId,
          documentId: docId,
          content: hit.content,
          ordinal: ordinalMatch ? Number(ordinalMatch[1]) : 0,
          metadata: {
            title: hit.title,
            updatedAt: hit.updatedAt,
            tags: hit.title.startsWith("execution:")
              ? (["execution_learning"] as const)
              : (["user_upload"] as const),
          },
        };
        if (existing) {
          byAsset.set(docId, {
            ...existing,
            content: `${existing.content}\n${hit.content}`,
            chunks: [...existing.chunks, chunk],
          });
        } else {
          byAsset.set(docId, {
            id: docId,
            sourceId: this.id,
            content: hit.content,
            chunks: [chunk],
            metadata: {
              title: hit.title || hit.documentId,
              updatedAt: hit.updatedAt,
              tags: hit.title.startsWith("execution:")
                ? ["execution_learning"]
                : ["user_upload"],
            },
          });
        }
      }

      return success([...byAsset.values()]);
    } catch {
      return success([]);
    }
  }
}

export function createProductChunkKnowledgeSource(): IKnowledgeSource {
  return new ProductChunkKnowledgeSource();
}
