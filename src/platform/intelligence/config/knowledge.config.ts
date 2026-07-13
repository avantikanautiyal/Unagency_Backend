/**
 * Knowledge configuration placeholders for future milestones.
 */

export interface KnowledgeConfig {
  readonly enabled: boolean;
  readonly defaultRetrievalLimit: number;
}

export function loadKnowledgeConfig(): KnowledgeConfig {
  return {
    enabled:
      (process.env.INTELLIGENCE_KNOWLEDGE_ENABLED ?? "false").toLowerCase() ===
      "true",
    defaultRetrievalLimit: Number(
      process.env.INTELLIGENCE_KNOWLEDGE_RETRIEVAL_LIMIT ?? 10
    ),
  };
}
