/**
 * Placeholder knowledge retriever — no vector search.
 */

import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type {
  KnowledgeDocument,
  KnowledgeRequest,
  KnowledgeSource,
} from "../contracts/knowledge-models";
import type {
  IKnowledgeRetriever,
  IKnowledgeSource,
} from "../interfaces/knowledge-ports";

export class KnowledgeRetriever implements IKnowledgeRetriever {
  constructor(private readonly sources: readonly IKnowledgeSource[]) {}

  async retrieve(
    request: KnowledgeRequest,
    sources: readonly KnowledgeSource[]
  ): Promise<Result<readonly KnowledgeDocument[]>> {
    const byId = new Map(this.sources.map((s) => [s.id, s]));
    const documents: KnowledgeDocument[] = [];

    for (const source of sources) {
      const impl = byId.get(source.id);
      if (!impl) continue;
      const listed = await impl.listDocuments(request);
      if (listed.ok) {
        documents.push(...listed.value);
      }
    }

    return success(documents);
  }
}
