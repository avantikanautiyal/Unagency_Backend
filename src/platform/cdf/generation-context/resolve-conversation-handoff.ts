/**
 * Phase 7A — Live conversation → working-memory handoff.
 *
 * Collaboration OS resolveConversation accepts either:
 *   - roomKey (channelId), or
 *   - Conversation ObjectId (conversationId)
 *
 * Prepass must use whichever identifier is present — not require channelId alone.
 */

export type WorkingMemoryConversationHandoff = {
  readonly channelIdPresent: boolean;
  readonly conversationIdPresent: boolean;
  /**
   * Value safe to pass to serviceConversationService.listMessages({ channelId }).
   * (Parameter name is historical; assertMembership resolves roomKey OR ObjectId.)
   */
  readonly storeHandle?: string;
  readonly channelId?: string;
  readonly conversationId?: string;
};

function metaTrim(
  metadata: Readonly<Record<string, unknown>> | undefined,
  key: string,
): string | undefined {
  if (!metadata) return undefined;
  const v = metadata[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/**
 * Resolve the strongest existing conversation identity from execution metadata.
 * Prefer channelId (roomKey) when present; fall back to conversationId.
 * Never invents identifiers.
 */
export function resolveWorkingMemoryConversationHandoff(
  metadata: Readonly<Record<string, unknown>> | undefined,
): WorkingMemoryConversationHandoff {
  const channelId = metaTrim(metadata, "channelId");
  const conversationId =
    metaTrim(metadata, "conversationId") ??
    metaTrim(metadata, "cdfConversationId");
  const storeHandle = channelId || conversationId;
  return {
    channelIdPresent: Boolean(channelId),
    conversationIdPresent: Boolean(conversationId),
    ...(storeHandle ? { storeHandle } : {}),
    ...(channelId ? { channelId } : {}),
    ...(conversationId ? { conversationId } : {}),
  };
}

/** Safe observability fields for handoff (no message bodies). */
export function workingMemoryHandoffObservability(input: {
  readonly handoff: WorkingMemoryConversationHandoff;
  readonly messageCountLoaded: number;
}): Record<string, unknown> {
  return {
    conversationIdPresent: input.handoff.conversationIdPresent,
    channelIdPresent: input.handoff.channelIdPresent,
    conversationContextAvailable: input.messageCountLoaded > 0,
    conversationMessageCountLoaded: input.messageCountLoaded,
  };
}
