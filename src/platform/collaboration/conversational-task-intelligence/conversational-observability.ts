/**
 * Priority 4.5 — Conversational turn observability (extends execution trace patterns).
 */

import { sanitizeOsLogFields } from "../../os/observability/execution-log";
import type { ConversationalTurnObservability } from "./conversational-task-contract";

export const CONVERSATIONAL_TURN_TRACE_PREFIX =
  "[UNAGENCY-CONVERSATION-TURN]" as const;

export function logConversationalTurnResolution(
  observability: ConversationalTurnObservability,
): void {
  try {
    const payload = sanitizeOsLogFields({
      conversationId: observability.conversationId,
      channelId: observability.channelId,
      messageId: observability.messageId,
      threadId: observability.threadId,
      resolvedAction: observability.resolvedAction,
      legacyIntent: observability.legacyIntent,
      requiresExecution: observability.requiresExecution,
      clarificationRequested: observability.clarificationRequested,
      referencedExecutionId: observability.referencedExecutionId,
      referencedArtifactId: observability.referencedArtifactId,
      referencedRouteId: observability.referencedRouteId,
      targetType: observability.targetType,
      targetCount: observability.targetCount,
      resolutionConfidence: observability.resolutionConfidence,
      requirementChangeCount: observability.requirementChangeCount,
      contextMessageCount: observability.contextMessageCount,
    });
    console.log(CONVERSATIONAL_TURN_TRACE_PREFIX, JSON.stringify(payload));
  } catch {
    // Observability must never break conversation flow.
  }
}
