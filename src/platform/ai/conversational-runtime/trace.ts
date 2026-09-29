/**
 * Phase 13 — Safe conversational runtime traces (counts/IDs/hashes only).
 */

export const CONVERSATIONAL_RUNTIME_TRACE_SCOPE =
  "ai.conversation_generation" as const;

export type ConversationalRuntimeTraceEventName =
  | "ai.conversation_generation.intent"
  | "ai.conversation_generation.context"
  | "ai.conversation_generation.completed"
  | "ai.conversation_generation.failed";

export type ConversationalRuntimeTraceEvent = {
  readonly name: ConversationalRuntimeTraceEventName;
  readonly scope: typeof CONVERSATIONAL_RUNTIME_TRACE_SCOPE;
  readonly at: string;
  readonly conversationIdPresent?: boolean;
  readonly channelIdPresent?: boolean;
  readonly conversationIdHash?: string;
  readonly cdfSessionId?: string;
  readonly cdfPhaseId?: string;
  readonly executionId?: string;
  readonly generationContextHash?: string;
  readonly upstreamArtifactCount?: number;
  readonly workingMemoryTurnCount?: number;
  readonly referenceCount?: number;
  readonly multimodalItemCount?: number;
  readonly code?: string;
  readonly message?: string;
  readonly inventedConversation?: false;
};

const _events: ConversationalRuntimeTraceEvent[] = [];

function push(event: ConversationalRuntimeTraceEvent): void {
  _events.push(event);
  if (_events.length > 200) _events.shift();
}

export function emitConversationalGenerationIntentTrace(
  fields: Omit<ConversationalRuntimeTraceEvent, "name" | "scope" | "at">,
): void {
  push({
    name: "ai.conversation_generation.intent",
    scope: CONVERSATIONAL_RUNTIME_TRACE_SCOPE,
    at: new Date().toISOString(),
    inventedConversation: false,
    ...fields,
  });
}

export function emitConversationalGenerationContextTrace(
  fields: Omit<ConversationalRuntimeTraceEvent, "name" | "scope" | "at">,
): void {
  push({
    name: "ai.conversation_generation.context",
    scope: CONVERSATIONAL_RUNTIME_TRACE_SCOPE,
    at: new Date().toISOString(),
    ...fields,
  });
}

export function emitConversationalGenerationCompletedTrace(
  fields: Omit<ConversationalRuntimeTraceEvent, "name" | "scope" | "at">,
): void {
  push({
    name: "ai.conversation_generation.completed",
    scope: CONVERSATIONAL_RUNTIME_TRACE_SCOPE,
    at: new Date().toISOString(),
    ...fields,
  });
}

export function emitConversationalGenerationFailedTrace(
  fields: Omit<ConversationalRuntimeTraceEvent, "name" | "scope" | "at">,
): void {
  push({
    name: "ai.conversation_generation.failed",
    scope: CONVERSATIONAL_RUNTIME_TRACE_SCOPE,
    at: new Date().toISOString(),
    ...fields,
  });
}

export function getConversationalRuntimeTraceEventsForTests(): readonly ConversationalRuntimeTraceEvent[] {
  return [..._events];
}

export function resetConversationalRuntimeTracesForTests(): void {
  _events.length = 0;
}
