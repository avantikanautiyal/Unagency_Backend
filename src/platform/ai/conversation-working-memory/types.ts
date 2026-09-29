/**
 * Conversation Working Memory (Phase 7) — types.
 * Contextual evidence only. Not CDF requirements / artifacts / refs.
 */

export const WORKING_MEMORY_SELECTION_METHOD =
  "deterministic_recency_relevance" as const;

export type WorkingMemoryRelevanceCategory =
  | "preceding_exchange"
  | "recent_user_statement"
  | "clarification"
  | "preference"
  | "entity_linked"
  | "recent_turn";

export type ConversationWorkingMemoryItem = {
  readonly messageId: string;
  readonly conversationId: string;
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly createdAt: string;
  /** Chronological order among selected items (0 = oldest selected). */
  readonly order: number;
  readonly relevanceCategory: WorkingMemoryRelevanceCategory;
  readonly relevanceReason: string;
  readonly isExplicitUserStatement: boolean;
  readonly executionId?: string;
  readonly artifactId?: string;
};

export type ConversationWorkingMemoryBounds = {
  readonly maxTurns: number;
  readonly maxCharacters: number;
  /** How many recent source messages to consider before scoring. */
  readonly candidateWindow: number;
};

/** Default hard bounds — deliberately conservative. */
export const DEFAULT_WORKING_MEMORY_BOUNDS: ConversationWorkingMemoryBounds =
  Object.freeze({
    maxTurns: 6,
    maxCharacters: 4000,
    candidateWindow: 20,
  });

export type ConversationWorkingMemory = {
  readonly conversationId?: string;
  readonly channelId?: string;
  readonly items: readonly ConversationWorkingMemoryItem[];
  readonly selectionMethod: typeof WORKING_MEMORY_SELECTION_METHOD;
  readonly truncated: boolean;
  readonly droppedItemCount: number;
  readonly characterCount: number;
  readonly turnCount: number;
  readonly bounds: ConversationWorkingMemoryBounds;
  /** True when at least one item was selected. */
  readonly applied: boolean;
};

/** Minimal message shape — compatible with ServiceAiMessageRecord. */
export type WorkingMemorySourceMessage = {
  readonly id: string;
  readonly conversationId: string;
  readonly channelId?: string;
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly createdAt: string;
  readonly dedupeKey?: string;
  readonly executionId?: string;
  readonly artifactId?: string;
  readonly clarification?: Record<string, unknown>;
  /**
   * Phase 9 — authorized message attachments (chat_attachment / MessageAttachment).
   * Identity + MIME + optional extracted text / URL refs. Not ArtifactVersions.
   */
  readonly attachments?: readonly {
    readonly mimeType?: string;
    readonly filename?: string;
    readonly fileName?: string;
    readonly url?: string;
    readonly assetId?: string;
    readonly attachmentId?: string;
    readonly sizeBytes?: number;
    readonly size?: number;
    readonly extractedText?: string;
  }[];
};

export type SelectConversationWorkingMemoryInput = {
  readonly messages: readonly WorkingMemorySourceMessage[];
  readonly currentUserInstruction: string;
  readonly conversationId?: string;
  readonly channelId?: string;
  /** Hard isolation — drop messages from other conversations. */
  readonly requireConversationIdMatch?: boolean;
  readonly referencedArtifactIds?: readonly string[];
  readonly referencedSlideNumbers?: readonly number[];
  readonly bounds?: Partial<ConversationWorkingMemoryBounds>;
};
