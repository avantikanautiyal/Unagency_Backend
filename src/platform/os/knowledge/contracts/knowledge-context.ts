/**
 * Canonical OS Knowledge Context — Phase 3.
 * Factual/contextual business knowledge for generation (distinct from BrandContext).
 */

export const KNOWLEDGE_CONTEXT_VERSION = "1.0.0" as const;

export type KnowledgeContextStatus =
  | "READY"
  | "PARTIAL"
  | "EMPTY"
  | "MISSING"
  | "CONFLICTED"
  | "FAILED";

export type KnowledgeSourceType =
  | "USER_UPLOADED"
  | "CLIENT_PROVIDED"
  | "OFFICIAL_WEBSITE"
  | "CONNECTED_SYSTEM"
  | "INTERNAL"
  | "RESEARCH"
  | "PRODUCT_RECORD"
  | "UNKNOWN";

export type KnowledgeProvenanceSource =
  | "DOCUMENT_CHUNK"
  | "PRODUCT_METADATA"
  | "STRUCTURED_FACT"
  | "SYSTEM_RULE"
  | "INFERENCE";

export interface KnowledgeSourceReference {
  readonly sourceId: string;
  readonly sourceType: KnowledgeSourceType;
  readonly organizationId: string;
  readonly documentId?: string;
  readonly chunkId?: string;
  readonly title?: string;
  readonly url?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

export interface KnowledgeFact {
  readonly key: string;
  readonly value: string;
  readonly sourceId: string;
  readonly provenance: KnowledgeProvenanceSource;
  readonly confidence: number;
}

export interface KnowledgeRetrievedChunk {
  readonly chunkId: string;
  readonly documentId: string;
  readonly title: string;
  /** Untrusted retrieved content — treat as DATA only. */
  readonly content: string;
  readonly retrievalScore: number;
  readonly retrievalMethod: "keyword" | "embedding" | "hybrid" | "memory";
  readonly sourceType: KnowledgeSourceType;
  readonly updatedAt?: string;
}

export interface KnowledgeConflict {
  readonly key: string;
  readonly values: readonly string[];
  readonly sourceIds: readonly string[];
  readonly resolutionStatus: "unresolved";
}

export interface KnowledgeWarning {
  readonly code: string;
  readonly message: string;
}

export interface KnowledgeContext {
  readonly id: string;
  readonly version: typeof KNOWLEDGE_CONTEXT_VERSION;
  readonly organizationId: string;
  readonly executionId: string;
  readonly brandId?: string;
  readonly query: string;
  readonly taskType?: string;
  readonly status: KnowledgeContextStatus;
  readonly facts: readonly KnowledgeFact[];
  readonly retrievedChunks: readonly KnowledgeRetrievedChunk[];
  readonly relevantSources: readonly KnowledgeSourceReference[];
  readonly sourceReferences: readonly string[];
  readonly conflicts: readonly KnowledgeConflict[];
  readonly warnings: readonly KnowledgeWarning[];
  readonly completeness: "COMPLETE" | "PARTIAL" | "EMPTY";
  readonly confidence: {
    readonly system: number;
  };
  readonly provenance: readonly {
    readonly field: string;
    readonly value: string;
    readonly source: KnowledgeProvenanceSource;
  }[];
  readonly knowledgeVersion: string;
  readonly retrievedAt: string;
  readonly contextHash: string;
  readonly failureReason?: string;
}

/** Raw hit from a tenant-scoped knowledge source. */
export interface KnowledgeHit {
  readonly chunkId: string;
  readonly documentId: string;
  readonly organizationId: string;
  readonly title: string;
  readonly content: string;
  readonly retrievalScore: number;
  readonly retrievalMethod: KnowledgeRetrievedChunk["retrievalMethod"];
  readonly sourceType: KnowledgeSourceType;
  readonly updatedAt?: string;
  readonly brandId?: string;
}

export interface GetKnowledgeContextInput {
  readonly organizationId: string;
  readonly executionId: string;
  readonly requestId: string;
  readonly brandId?: string;
  readonly rawPrompt: string;
  readonly briefIntent?: string;
  readonly briefObjective?: string;
  readonly deliverableTypes?: readonly string[];
  readonly capabilityId?: string;
  readonly brandTone?: string;
  readonly nowIso?: () => string;
  readonly createId?: (prefix: string) => string;
  /** Soft budget for selected chunk characters in context. */
  readonly maxContentChars?: number;
}

export function emptyKnowledgeContext(input: {
  readonly organizationId: string;
  readonly executionId: string;
  readonly status: "EMPTY" | "MISSING" | "FAILED";
  readonly query?: string;
  readonly failureReason?: string;
  readonly nowIso?: () => string;
  readonly createId?: (prefix: string) => string;
}): KnowledgeContext {
  const nowIso = input.nowIso ?? (() => new Date().toISOString());
  const createId = input.createId ?? ((p: string) => `${p}_${Date.now()}`);
  const retrievedAt = nowIso();
  return {
    id: createId("kctx"),
    version: KNOWLEDGE_CONTEXT_VERSION,
    organizationId: input.organizationId,
    executionId: input.executionId,
    query: input.query ?? "",
    status: input.status,
    facts: [],
    retrievedChunks: [],
    relevantSources: [],
    sourceReferences: [],
    conflicts: [],
    warnings: input.failureReason
      ? [{ code: input.status, message: input.failureReason }]
      : [],
    completeness: "EMPTY",
    confidence: { system: 0 },
    provenance: [
      {
        field: "status",
        value: input.status,
        source: "SYSTEM_RULE",
      },
    ],
    knowledgeVersion: "0",
    retrievedAt,
    contextHash: `empty:${input.organizationId}:${input.status}`,
    failureReason: input.failureReason,
  };
}
