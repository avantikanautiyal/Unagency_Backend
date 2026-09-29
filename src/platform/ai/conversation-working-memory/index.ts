/**
 * AI Core — Conversation Working Memory (Phase 7).
 * Bounded deterministic conversational evidence for CMR assembly.
 * Does NOT implement RAG, embeddings, or long-term memory.
 */

export type {
  WorkingMemoryRelevanceCategory,
  ConversationWorkingMemoryItem,
  ConversationWorkingMemoryBounds,
  ConversationWorkingMemory,
  WorkingMemorySourceMessage,
  SelectConversationWorkingMemoryInput,
} from "./types";

export {
  DEFAULT_WORKING_MEMORY_BOUNDS,
  WORKING_MEMORY_SELECTION_METHOD,
} from "./types";

export {
  selectConversationWorkingMemory,
  summarizeWorkingMemoryForTrace,
} from "./select";
