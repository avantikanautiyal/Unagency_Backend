/**
 * CDF adapter — build Conversation Working Memory from already-loaded messages.
 * No DB access. No LLM. Integrates Phase 6 reference IDs for entity linking.
 */

import {
  selectConversationWorkingMemory,
  summarizeWorkingMemoryForTrace,
  type ConversationWorkingMemory,
  type WorkingMemorySourceMessage,
} from "../../ai/conversation-working-memory";
import type { GenerationReferenceResolutionResult } from "../../ai/reference-resolution";

export function resolveCanonicalWorkingMemory(input: {
  readonly messages?: readonly WorkingMemorySourceMessage[];
  readonly currentUserInstruction: string;
  readonly conversationId?: string;
  readonly channelId?: string;
  readonly referenceResolution?: GenerationReferenceResolutionResult;
  readonly bounds?: {
    maxTurns?: number;
    maxCharacters?: number;
    candidateWindow?: number;
  };
}): ConversationWorkingMemory {
  const refs = input.referenceResolution?.references ?? [];
  const referencedArtifactIds = refs
    .map((r) => r.artifactId)
    .filter((x): x is string => Boolean(x));
  const referencedSlideNumbers = refs
    .map((r) => r.slideNumber)
    .filter((x): x is number => typeof x === "number" && x > 0);

  return selectConversationWorkingMemory({
    messages: input.messages ?? [],
    currentUserInstruction: input.currentUserInstruction,
    conversationId: input.conversationId,
    channelId: input.channelId,
    requireConversationIdMatch: Boolean(input.conversationId),
    referencedArtifactIds,
    referencedSlideNumbers,
    bounds: input.bounds,
  });
}

export function conversationMessagesFromMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
): WorkingMemorySourceMessage[] {
  if (!metadata) return [];
  const raw = metadata.conversationWorkingMemoryMessages;
  if (!Array.isArray(raw)) return [];
  const out: WorkingMemorySourceMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    const id = typeof m.id === "string" ? m.id.trim() : "";
    const conversationId =
      typeof m.conversationId === "string" ? m.conversationId.trim() : "";
    const role = m.role === "assistant" ? "assistant" : m.role === "user" ? "user" : null;
    const text = typeof m.text === "string" ? m.text : "";
    const createdAt =
      typeof m.createdAt === "string" ? m.createdAt : new Date(0).toISOString();
    if (!id || !conversationId || !role || !text.trim()) continue;
    out.push({
      id,
      conversationId,
      role,
      text,
      createdAt,
      ...(typeof m.channelId === "string" ? { channelId: m.channelId } : {}),
      ...(typeof m.dedupeKey === "string" ? { dedupeKey: m.dedupeKey } : {}),
      ...(typeof m.executionId === "string" ? { executionId: m.executionId } : {}),
      ...(typeof m.artifactId === "string" ? { artifactId: m.artifactId } : {}),
      ...(m.clarification && typeof m.clarification === "object"
        ? { clarification: m.clarification as Record<string, unknown> }
        : {}),
    });
  }
  return out;
}

export { summarizeWorkingMemoryForTrace };
