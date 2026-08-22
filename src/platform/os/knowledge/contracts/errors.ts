/**
 * Knowledge Intelligence error codes — client-safe.
 */

export type KnowledgeIntelligenceErrorCode =
  | "KNOWLEDGE_INVALID"
  | "KNOWLEDGE_TENANT_VIOLATION"
  | "KNOWLEDGE_CONTEXT_INVALID"
  | "KNOWLEDGE_STORE_UNAVAILABLE"
  | "KNOWLEDGE_CONTEXT_FAILED";

export class KnowledgeIntelligenceError extends Error {
  constructor(
    readonly code: KnowledgeIntelligenceErrorCode,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>
  ) {
    super(message);
    this.name = "KnowledgeIntelligenceError";
  }
}
