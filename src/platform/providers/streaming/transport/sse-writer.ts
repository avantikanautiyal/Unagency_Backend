/**
 * M9.5O — SSE framing + backpressure-aware writer helpers.
 */

import type { ProviderStreamEvent } from "../contracts/provider-stream-event";
import type { SseFrame } from "../../../api/contracts/streaming";

/** Map canonical stream events → provider-neutral SSE event names. */
export function providerStreamEventToSse(
  event: ProviderStreamEvent
): SseFrame {
  const safePayload: Record<string, unknown> = {
    type: event.type,
    executionId: event.executionId,
    attemptId: event.attemptId,
    providerId: event.providerId,
    modelId: event.modelId,
    capabilityId: event.capabilityId,
    sequence: event.sequence,
    at: event.at,
  };
  if (event.contentDelta !== undefined) safePayload.contentDelta = event.contentDelta;
  if (event.reasoningDelta !== undefined) {
    safePayload.reasoningDelta = event.reasoningDelta;
  }
  if (event.toolCall) {
    safePayload.toolCall = {
      id: event.toolCall.id,
      name: event.toolCall.name,
      // arguments may be partial — still safe vs credentials
      argumentsDelta: event.toolCall.argumentsDelta,
    };
  }
  if (event.audio) {
    // Never put raw audio bytes into SSE JSON.
    safePayload.audio = {
      byteLength: event.audio.byteLength,
      mimeType: event.audio.mimeType,
    };
  }
  if (event.usage) safePayload.usage = event.usage;
  if (event.finishReason) safePayload.finishReason = event.finishReason;
  if (event.errorCode) safePayload.errorCode = event.errorCode;
  if (event.errorMessage) safePayload.errorMessage = event.errorMessage;

  const eventName =
    event.type === "stream.started"
      ? "execution.started"
      : event.type === "stream.completed"
        ? "execution.completed"
        : event.type === "stream.failed"
          ? "execution.failed"
          : event.type === "stream.cancelled"
            ? "execution.cancelled"
            : event.type;

  return {
    event: eventName,
    id: `${event.attemptId ?? "att"}_${event.sequence}`,
    data: JSON.stringify(safePayload),
  };
}

export function formatSseFrame(frame: SseFrame): string {
  return `id: ${frame.id}\nevent: ${frame.event}\ndata: ${frame.data}\n\n`;
}

