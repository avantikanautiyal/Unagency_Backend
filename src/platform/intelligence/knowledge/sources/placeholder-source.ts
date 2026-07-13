/**
 * Placeholder knowledge sources — no DB/HTTP/vector access.
 */

import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type {
  KnowledgeDocument,
  KnowledgeRequest,
  KnowledgeSourceKind,
} from "../contracts/knowledge-models";
import type { IKnowledgeSource } from "../interfaces/knowledge-ports";

export class PlaceholderKnowledgeSource implements IKnowledgeSource {
  constructor(
    readonly id: string,
    readonly kind: KnowledgeSourceKind,
    readonly name: string,
    private readonly documents: readonly KnowledgeDocument[] = []
  ) {}

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async listDocuments(
    _request: KnowledgeRequest
  ): Promise<Result<readonly KnowledgeDocument[]>> {
    return success(this.documents);
  }
}

export function createDefaultPlaceholderSources(): readonly IKnowledgeSource[] {
  const brandDoc: KnowledgeDocument = {
    id: "doc_brand_1",
    sourceId: "source_brand",
    content: "Brand voice is professional and clear.",
    chunks: [
      {
        id: "chunk_brand_1",
        documentId: "doc_brand_1",
        content: "Brand voice is professional and clear.",
        ordinal: 0,
      },
    ],
    metadata: {
      title: "Brand Guidelines",
      tags: ["brand", "guidelines"],
      updatedAt: "2026-01-01T00:00:00.000Z",
      classification: "internal",
    },
  };

  const inlineDoc: KnowledgeDocument = {
    id: "doc_inline_1",
    sourceId: "source_inline",
    content: "Inline knowledge for integration tests.",
    chunks: [
      {
        id: "chunk_inline_1",
        documentId: "doc_inline_1",
        content: "Inline knowledge for integration tests.",
        ordinal: 0,
      },
    ],
    metadata: {
      title: "Inline Knowledge",
      tags: ["inline"],
      updatedAt: "2026-02-01T00:00:00.000Z",
      classification: "internal",
    },
  };

  const deprecatedDoc: KnowledgeDocument = {
    id: "doc_old_1",
    sourceId: "source_inline",
    content: "Deprecated knowledge.",
    chunks: [
      {
        id: "chunk_old_1",
        documentId: "doc_old_1",
        content: "Deprecated knowledge.",
        ordinal: 0,
      },
    ],
    metadata: {
      title: "Deprecated Doc",
      tags: ["old"],
      deprecated: true,
      updatedAt: "2020-01-01T00:00:00.000Z",
      expiresAt: "2021-01-01T00:00:00.000Z",
    },
  };

  return [
    new PlaceholderKnowledgeSource(
      "source_brand",
      "brand_guideline",
      "Brand Guidelines",
      [brandDoc]
    ),
    new PlaceholderKnowledgeSource("source_inline", "inline", "Inline Source", [
      inlineDoc,
      deprecatedDoc,
    ]),
  ];
}
