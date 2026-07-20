/**
 * Search indexing abstraction — no OpenSearch/ES SDK.
 */

import { success, type Result } from "../../intelligence/shared/result";
import type { SearchIndexDocument } from "../contracts";
import type { ISearchIndexer } from "../interfaces";

export class InMemorySearchIndexer implements ISearchIndexer {
  private readonly docs = new Map<string, SearchIndexDocument>();

  constructor(private readonly nowIso: () => string) {}

  async index(
    doc: Omit<SearchIndexDocument, "indexedAt">
  ): Promise<Result<SearchIndexDocument>> {
    const full: SearchIndexDocument = { ...doc, indexedAt: this.nowIso() };
    this.docs.set(`${doc.indexName}:${doc.documentId}`, full);
    return success(full);
  }

  async remove(indexName: string, documentId: string): Promise<Result<void>> {
    this.docs.delete(`${indexName}:${documentId}`);
    return success(undefined);
  }

  async search(
    indexName: string,
    query: string,
    organizationId?: string
  ): Promise<Result<readonly SearchIndexDocument[]>> {
    const q = query.toLowerCase();
    const hits = [...this.docs.values()].filter((d) => {
      if (d.indexName !== indexName) return false;
      if (organizationId && d.organizationId !== organizationId) return false;
      return JSON.stringify(d.body).toLowerCase().includes(q);
    });
    return success(hits);
  }
}
