/**
 * Deterministic Conversation Working Memory selector (Phase 7).
 * No LLM. No embeddings. No project-wide search.
 * Source: already-loaded Collaboration OS / Service AI messages.
 */

import { isInternalExecutionPrompt } from "../../collaboration/service-conversation-context";
import {
  DEFAULT_WORKING_MEMORY_BOUNDS,
  WORKING_MEMORY_SELECTION_METHOD,
  type ConversationWorkingMemory,
  type ConversationWorkingMemoryBounds,
  type ConversationWorkingMemoryItem,
  type SelectConversationWorkingMemoryInput,
  type WorkingMemoryRelevanceCategory,
  type WorkingMemorySourceMessage,
} from "./types";

function normalizeBounds(
  partial?: Partial<ConversationWorkingMemoryBounds>,
): ConversationWorkingMemoryBounds {
  return {
    maxTurns: Math.max(
      1,
      Math.min(
        20,
        partial?.maxTurns ?? DEFAULT_WORKING_MEMORY_BOUNDS.maxTurns,
      ),
    ),
    maxCharacters: Math.max(
      200,
      Math.min(
        20_000,
        partial?.maxCharacters ?? DEFAULT_WORKING_MEMORY_BOUNDS.maxCharacters,
      ),
    ),
    candidateWindow: Math.max(
      1,
      Math.min(
        80,
        partial?.candidateWindow ??
          DEFAULT_WORKING_MEMORY_BOUNDS.candidateWindow,
      ),
    ),
  };
}

function emptyMemory(
  bounds: ConversationWorkingMemoryBounds,
  conversationId?: string,
  channelId?: string,
): ConversationWorkingMemory {
  return {
    conversationId,
    channelId,
    items: Object.freeze([]),
    selectionMethod: WORKING_MEMORY_SELECTION_METHOD,
    truncated: false,
    droppedItemCount: 0,
    characterCount: 0,
    turnCount: 0,
    bounds,
    applied: false,
  };
}

function looksLikeClarification(text: string, role: string): boolean {
  if (role === "assistant") {
    return /\?|clarify|which|do you want|prefer|confirm/i.test(text);
  }
  return /\byes\b|\bno\b|keep|instead|rather|minimal|but make/i.test(text);
}

function looksLikePreference(text: string): boolean {
  return /\b(prefer|style|tone|premium|minimal|keep the|same layout|more|less)\b/i.test(
    text,
  );
}

function mentionsSlide(
  text: string,
  slides: readonly number[] | undefined,
): boolean {
  if (!slides?.length) return false;
  for (const n of slides) {
    if (new RegExp(`\\bslide\\s*#?\\s*${n}\\b`, "i").test(text)) return true;
  }
  return false;
}

type Scored = {
  message: WorkingMemorySourceMessage;
  score: number;
  category: WorkingMemoryRelevanceCategory;
  reason: string;
  at: number;
};

/**
 * Select a bounded working-memory slice from already-authorized messages.
 * Current user instruction is never included/rewritten here.
 */
export function selectConversationWorkingMemory(
  input: SelectConversationWorkingMemoryInput,
): ConversationWorkingMemory {
  const bounds = normalizeBounds(input.bounds);
  const conversationId = input.conversationId?.trim() || undefined;
  const channelId = input.channelId?.trim() || undefined;
  const current = input.currentUserInstruction.trim();

  if (!input.messages?.length) {
    return emptyMemory(bounds, conversationId, channelId);
  }

  // Isolation: only same conversation (when known).
  let pool = [...input.messages];
  if (conversationId && input.requireConversationIdMatch !== false) {
    pool = pool.filter((m) => m.conversationId === conversationId);
  }
  if (channelId) {
    // Soft filter when channel present on messages
    const withChannel = pool.filter(
      (m) => !m.channelId || m.channelId === channelId,
    );
    if (withChannel.length) pool = withChannel;
  }

  // Chronological then take candidate window from the end (most recent).
  pool.sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const droppedByWindow = Math.max(0, pool.length - bounds.candidateWindow);
  const candidates = pool.slice(-bounds.candidateWindow);

  const refArts = new Set(
    (input.referencedArtifactIds ?? []).filter(Boolean),
  );

  const scored: Scored[] = [];
  const n = candidates.length;
  for (let i = 0; i < n; i++) {
    const message = candidates[i]!;
    const text = (message.text ?? "").trim();
    if (!text) continue;
    if (isInternalExecutionPrompt(text)) continue;
    // Do not duplicate the current instruction into memory.
    if (current && text === current) continue;

    let score = 0;
    let category: WorkingMemoryRelevanceCategory = "recent_turn";
    const reasons: string[] = [];

    const recencyBoost = i; // later = more recent within window
    score += recencyBoost;

    // Immediately preceding turns (last 1–2 in candidate window).
    if (i >= n - 2) {
      score += 40;
      category = "preceding_exchange";
      reasons.push("preceding_exchange");
    } else if (i >= n - 4) {
      score += 20;
      reasons.push("recent_window");
    }

    if (message.role === "user") {
      score += 15;
      if (category === "recent_turn") category = "recent_user_statement";
      reasons.push("user_statement");
    } else {
      score += 5;
      reasons.push("assistant_turn");
    }

    if (looksLikeClarification(text, message.role)) {
      score += 18;
      category = "clarification";
      reasons.push("clarification");
    }
    if (message.role === "user" && looksLikePreference(text)) {
      score += 12;
      if (category !== "clarification") category = "preference";
      reasons.push("preference");
    }

    if (message.artifactId && refArts.has(message.artifactId)) {
      score += 30;
      category = "entity_linked";
      reasons.push("referenced_artifact");
    }
    if (mentionsSlide(text, input.referencedSlideNumbers)) {
      score += 16;
      if (category !== "entity_linked") category = "entity_linked";
      reasons.push("referenced_slide");
    }

    // Weak lexical overlap with current instruction (deterministic, no embeddings).
    if (current.length >= 8) {
      const tokens = current
        .toLowerCase()
        .split(/\W+/)
        .filter((t) => t.length > 3)
        .slice(0, 12);
      let hits = 0;
      const lower = text.toLowerCase();
      for (const t of tokens) {
        if (lower.includes(t)) hits += 1;
      }
      if (hits >= 2) {
        score += hits * 2;
        reasons.push("lexical_overlap");
      }
    }

    scored.push({
      message,
      score,
      category,
      reason: reasons.join("+") || "scored",
      at: new Date(message.createdAt).getTime(),
    });
  }

  // Highest score first; tie-break by recency.
  scored.sort((a, b) => b.score - a.score || b.at - a.at);

  const selected: Scored[] = [];
  let chars = 0;
  const seen = new Set<string>();

  for (const item of scored) {
    if (selected.length >= bounds.maxTurns) break;
    const key = item.message.dedupeKey || item.message.id;
    if (seen.has(key)) continue;
    const nextChars = chars + item.message.text.length;
    if (selected.length > 0 && nextChars > bounds.maxCharacters) {
      // Skip lower-priority rather than truncate message text mid-content.
      continue;
    }
    if (item.message.text.length > bounds.maxCharacters && selected.length === 0) {
      // Single oversized turn: keep a head slice for evidence (instruction untouched).
      const truncatedText = item.message.text.slice(0, bounds.maxCharacters);
      selected.push({
        ...item,
        message: { ...item.message, text: truncatedText },
      });
      chars = truncatedText.length;
      seen.add(key);
      continue;
    }
    if (nextChars > bounds.maxCharacters && selected.length === 0) {
      continue;
    }
    selected.push(item);
    chars = nextChars;
    seen.add(key);
  }

  // Chronological for CMR readability.
  selected.sort((a, b) => a.at - b.at);

  const items: ConversationWorkingMemoryItem[] = selected.map((s, order) =>
    Object.freeze({
      messageId: s.message.id,
      conversationId: s.message.conversationId,
      role: s.message.role,
      text: s.message.text.trim(),
      createdAt: s.message.createdAt,
      order,
      relevanceCategory: s.category,
      relevanceReason: s.reason,
      isExplicitUserStatement: s.message.role === "user",
      ...(s.message.executionId
        ? { executionId: s.message.executionId }
        : {}),
      ...(s.message.artifactId ? { artifactId: s.message.artifactId } : {}),
    }),
  );

  const considered = scored.length;
  const droppedItemCount =
    droppedByWindow + Math.max(0, considered - items.length);
  const truncated =
    droppedItemCount > 0 ||
    scored.length > items.length ||
    droppedByWindow > 0;

  const characterCount = items.reduce((n, i) => n + i.text.length, 0);

  return {
    conversationId:
      conversationId ??
      items[0]?.conversationId ??
      candidates[0]?.conversationId,
    channelId,
    items: Object.freeze(items),
    selectionMethod: WORKING_MEMORY_SELECTION_METHOD,
    truncated,
    droppedItemCount,
    characterCount,
    turnCount: items.length,
    bounds,
    applied: items.length > 0,
  };
}

/** Safe observability projection — IDs/counts only. */
export function summarizeWorkingMemoryForTrace(
  memory: ConversationWorkingMemory | undefined,
): {
  workingMemoryApplied: boolean;
  workingMemoryItemCount: number;
  workingMemoryCharacterCount: number;
  workingMemoryTurnCount: number;
  workingMemorySelectionMethod: string;
  workingMemoryTruncated: boolean;
  workingMemoryDroppedItemCount: number;
  workingMemorySourceConversationId?: string;
} {
  if (!memory) {
    return {
      workingMemoryApplied: false,
      workingMemoryItemCount: 0,
      workingMemoryCharacterCount: 0,
      workingMemoryTurnCount: 0,
      workingMemorySelectionMethod: WORKING_MEMORY_SELECTION_METHOD,
      workingMemoryTruncated: false,
      workingMemoryDroppedItemCount: 0,
    };
  }
  return {
    workingMemoryApplied: memory.applied,
    workingMemoryItemCount: memory.items.length,
    workingMemoryCharacterCount: memory.characterCount,
    workingMemoryTurnCount: memory.turnCount,
    workingMemorySelectionMethod: memory.selectionMethod,
    workingMemoryTruncated: memory.truncated,
    workingMemoryDroppedItemCount: memory.droppedItemCount,
    workingMemorySourceConversationId: memory.conversationId,
  };
}
