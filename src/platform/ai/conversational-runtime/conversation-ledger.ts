/**
 * Phase 13A — In-process conversation message ledger.
 *
 * Test/harness adapter for Collaboration OS message persistence when Mongo is
 * unavailable. Production prepass still uses serviceConversationService.
 * This is NOT a second conversation product store — same WorkingMemorySourceMessage
 * shape, same conversationId isolation rules.
 */

import type { WorkingMemorySourceMessage } from "../conversation-working-memory";

const _byHandle = new Map<string, WorkingMemorySourceMessage[]>();

function handleKey(input: {
  readonly conversationId?: string;
  readonly channelId?: string;
}): string | undefined {
  const channel = input.channelId?.trim();
  const conv = input.conversationId?.trim();
  return channel || conv || undefined;
}

/** Persist a conversational turn into the in-process ledger. */
export function persistConversationalMessage(
  message: WorkingMemorySourceMessage,
): void {
  const key = handleKey(message);
  if (!key) return;
  const list = _byHandle.get(key) ?? [];
  list.push(message);
  // Also index by conversationId when channel was the primary key.
  _byHandle.set(key, list);
  if (
    message.conversationId &&
    message.conversationId !== key &&
    message.channelId === key
  ) {
    const byConv = _byHandle.get(message.conversationId) ?? [];
    byConv.push(message);
    _byHandle.set(message.conversationId, byConv);
  }
}

/**
 * Load messages for working memory. Same-conversation only.
 * Never invents a conversation handle.
 */
export function loadPersistedConversationalMessages(input: {
  readonly conversationId?: string;
  readonly channelId?: string;
}): WorkingMemorySourceMessage[] {
  const key = handleKey(input);
  if (!key) return [];
  const list = _byHandle.get(key) ?? [];
  if (!input.conversationId) return [...list];
  return list.filter((m) => m.conversationId === input.conversationId);
}

export function resetConversationalMessageLedgerForTests(): void {
  _byHandle.clear();
}
