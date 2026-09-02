/**
 * M9.5O1 — Anthropic Messages streaming SSE → ProviderStreamEvent.
 * Wire format from Anthropic Messages API streaming docs (public contract).
 * Fixture-driven offline — no network.
 */

import type { ProviderStreamEvent } from "../contracts/provider-stream-event";
import type { ParsedSseEvent } from "./sse-incremental-parser";
import type { OpenAiCompatMapContext } from "./openai-compat-stream-mapper";

/**
 * Map Anthropic SSE event (event: + data:) to canonical events.
 */
export function mapAnthropicSseEvent(
  sse: ParsedSseEvent,
  ctx: OpenAiCompatMapContext,
  sequence: { value: number },
  toolState: { currentId?: string; currentName?: string }
): { events: ProviderStreamEvent[]; done: boolean; error?: string } {
  const base = {
    executionId: ctx.executionId,
    attemptId: ctx.attemptId,
    providerId: ctx.providerId,
    modelId: ctx.modelId,
    capabilityId: ctx.capabilityId,
  };
  const at = ctx.nowIso();
  const eventName = sse.event ?? "";

  if (!sse.data.trim()) {
    return { events: [], done: false };
  }

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(sse.data) as Record<string, unknown>;
  } catch {
    return {
      events: [
        {
          ...base,
          type: "stream.failed",
          sequence: sequence.value++,
          errorCode: "malformed_sse_json",
          errorMessage: "malformed Anthropic SSE JSON",
          at,
        },
      ],
      done: true,
      error: "malformed_sse_json",
    };
  }

  if (eventName === "error" || json.type === "error") {
    const err = (json.error ?? json) as Record<string, unknown>;
    return {
      events: [
        {
          ...base,
          type: "stream.failed",
          sequence: sequence.value++,
          errorCode: String(err.type ?? "provider_error"),
          errorMessage: String(err.message ?? "anthropic error"),
          at,
        },
      ],
      done: true,
      error: "provider_error",
    };
  }

  const events: ProviderStreamEvent[] = [];

  if (eventName === "content_block_start" || json.type === "content_block_start") {
    const block = (json.content_block ?? {}) as Record<string, unknown>;
    if (block.type === "tool_use") {
      const id = String(block.id ?? `tool_${sequence.value}`);
      const name = String(block.name ?? "");
      toolState.currentId = id;
      toolState.currentName = name;
      events.push({
        ...base,
        type: "tool_call.started",
        sequence: sequence.value++,
        toolCall: { id, name },
        at,
      });
    }
  }

  if (eventName === "content_block_delta" || json.type === "content_block_delta") {
    const delta = (json.delta ?? {}) as Record<string, unknown>;
    if (delta.type === "text_delta" && typeof delta.text === "string") {
      events.push({
        ...base,
        type: "content.delta",
        sequence: sequence.value++,
        contentDelta: delta.text,
        at,
      });
    }
    if (
      delta.type === "input_json_delta" &&
      typeof delta.partial_json === "string"
    ) {
      events.push({
        ...base,
        type: "tool_call.arguments.delta",
        sequence: sequence.value++,
        toolCall: {
          id: toolState.currentId ?? "tool_unknown",
          argumentsDelta: delta.partial_json,
        },
        at,
      });
    }
  }

  if (eventName === "content_block_stop" || json.type === "content_block_stop") {
    if (toolState.currentId) {
      events.push({
        ...base,
        type: "tool_call.completed",
        sequence: sequence.value++,
        toolCall: { id: toolState.currentId },
        at,
      });
      toolState.currentId = undefined;
      toolState.currentName = undefined;
    }
  }

  if (eventName === "message_delta" || json.type === "message_delta") {
    const usage = (json.usage ?? {}) as Record<string, unknown>;
    if (
      typeof usage.output_tokens === "number" ||
      typeof usage.input_tokens === "number"
    ) {
      const promptTokens =
        typeof usage.input_tokens === "number" ? usage.input_tokens : null;
      const completionTokens =
        typeof usage.output_tokens === "number" ? usage.output_tokens : null;
      events.push({
        ...base,
        type: "usage.final",
        sequence: sequence.value++,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens:
            promptTokens != null || completionTokens != null
              ? (promptTokens ?? 0) + (completionTokens ?? 0)
              : null,
        },
        at,
      });
    }
  }

  if (eventName === "message_stop" || json.type === "message_stop") {
    return { events, done: true };
  }

  return { events, done: false };
}
