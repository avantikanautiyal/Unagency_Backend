/**
 * Priority 4.5 — Relevant context selection (not raw conversation dump).
 */

import type { ServiceAiMessageRecord } from "../service-conversation-types";
import type { ConversationalTaskThread } from "./conversational-task-contract";

export function selectRelevantMessages(input: {
  readonly messages: readonly ServiceAiMessageRecord[];
  readonly thread: ConversationalTaskThread;
  readonly latestUserMessage: string;
  readonly maxMessages?: number;
}): readonly ServiceAiMessageRecord[] {
  const max = input.maxMessages ?? 12;
  const executionIds = new Set(
    [
      input.thread.activeExecutionId,
      input.thread.parentExecutionId,
      ...input.thread.alternatives.map((a) => a.executionId),
    ].filter(Boolean) as string[],
  );

  const scored = input.messages.map((message) => {
    let score = 0;
    if (message.executionId && executionIds.has(message.executionId)) score += 10;
    if (message.artifactId && message.artifactId === input.thread.activeArtifactId) {
      score += 8;
    }
    if (message.role === "user") score += 2;
    if (message.routes?.length) score += 5;
    if (message.text && input.latestUserMessage.includes(message.text.slice(0, 20))) {
      score += 3;
    }
    return { message, score, at: new Date(message.createdAt).getTime() };
  });

  const recent = [...input.messages]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 3);

  const selected = new Map<string, ServiceAiMessageRecord>();
  for (const item of scored.sort((a, b) => b.score - a.score || b.at - a.at).slice(0, max)) {
    selected.set(item.message.dedupeKey || item.message.id, item.message);
  }
  for (const message of recent) {
    selected.set(message.dedupeKey || message.id, message);
  }

  return Object.freeze(
    [...selected.values()].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    ),
  );
}
