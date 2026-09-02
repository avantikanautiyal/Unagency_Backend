/**
 * M9.5O1 — Map OpenAI Chat Completions SSE JSON → ProviderStreamEvent.
 * Same wire family used by verified openai_compatible vendors.
 */

import type { ProviderStreamEvent } from "../contracts/provider-stream-event";
import type { ParsedSseEvent } from "./sse-incremental-parser";

export interface OpenAiCompatMapContext {
  readonly executionId: string;
  readonly attemptId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityId: string;
  readonly nowIso: () => string;
  /** Persist tool call ids by stream index across fragmented deltas. */
  readonly toolIdsByIndex?: Map<number, string>;
}

/**
 * Convert one SSE data payload into zero or more canonical events.
 * Returns { done: true } when [DONE] received (caller emits stream.completed).
 */
export function mapOpenAiCompatSseData(
  sse: ParsedSseEvent,
  ctx: OpenAiCompatMapContext,
  sequence: { value: number }
): { events: ProviderStreamEvent[]; done: boolean; error?: string } {
  const base = {
    executionId: ctx.executionId,
    attemptId: ctx.attemptId,
    providerId: ctx.providerId,
    modelId: ctx.modelId,
    capabilityId: ctx.capabilityId,
  };
  const at = ctx.nowIso();

  if (sse.data.trim() === "[DONE]") {
    return { events: [], done: true };
  }
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
          errorMessage: "malformed SSE data JSON",
          at,
        },
      ],
      done: true,
      error: "malformed_sse_json",
    };
  }

  if (json.error && typeof json.error === "object") {
    const err = json.error as Record<string, unknown>;
    return {
      events: [
        {
          ...base,
          type: "stream.failed",
          sequence: sequence.value++,
          errorCode: String(err.code ?? "provider_error"),
          errorMessage: String(err.message ?? "provider error"),
          at,
        },
      ],
      done: true,
      error: "provider_error",
    };
  }

  const events: ProviderStreamEvent[] = [];
  const choices = Array.isArray(json.choices) ? json.choices : [];
  for (const choice of choices) {
    if (!choice || typeof choice !== "object") continue;
    const c = choice as Record<string, unknown>;
    const delta = (c.delta ?? {}) as Record<string, unknown>;
    const finishReason =
      typeof c.finish_reason === "string" ? c.finish_reason : undefined;

    if (typeof delta.content === "string" && delta.content.length > 0) {
      events.push({
        ...base,
        type: "content.delta",
        sequence: sequence.value++,
        contentDelta: delta.content,
        at,
      });
    }

    // reasoning_content is OpenAI/compat optional — only emit if present
    if (
      typeof delta.reasoning_content === "string" &&
      delta.reasoning_content.length > 0
    ) {
      events.push({
        ...base,
        type: "reasoning.delta",
        sequence: sequence.value++,
        reasoningDelta: delta.reasoning_content,
        at,
      });
    }

    const toolCalls = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
    for (const tc of toolCalls) {
      if (!tc || typeof tc !== "object") continue;
      const t = tc as Record<string, unknown>;
      const index = typeof t.index === "number" ? t.index : 0;
      const idMap = ctx.toolIdsByIndex;
      let id =
        typeof t.id === "string" && t.id
          ? t.id
          : idMap?.get(index) ?? `tool_${index}`;
      if (typeof t.id === "string" && t.id && idMap) {
        idMap.set(index, t.id);
        id = t.id;
      } else if (idMap && !idMap.has(index)) {
        idMap.set(index, id);
      }
      const fn = (t.function ?? {}) as Record<string, unknown>;
      const name = typeof fn.name === "string" ? fn.name : undefined;
      const argsDelta =
        typeof fn.arguments === "string" ? fn.arguments : undefined;

      if (name) {
        events.push({
          ...base,
          type: "tool_call.started",
          sequence: sequence.value++,
          toolCall: { id, name },
          at,
        });
      }
      if (argsDelta) {
        events.push({
          ...base,
          type: "tool_call.arguments.delta",
          sequence: sequence.value++,
          toolCall: { id, argumentsDelta: argsDelta },
          at,
        });
      }
    }

    if (finishReason === "tool_calls") {
      // Completion of tool-call stream signaled by finish_reason
      // Individual tool_call.completed emitted by assembler/orchestrator consumers.
    }
    if (finishReason && finishReason !== "null") {
      // carry via metadata on a lifecycle event — final completed handled on [DONE]
    }
  }

  // Usage often on final chunk (stream_options.include_usage)
  const usage = json.usage as Record<string, unknown> | undefined;
  if (usage && typeof usage === "object") {
    const promptTokens =
      typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : null;
    const completionTokens =
      typeof usage.completion_tokens === "number"
        ? usage.completion_tokens
        : null;
    const totalTokens =
      typeof usage.total_tokens === "number"
        ? usage.total_tokens
        : promptTokens != null || completionTokens != null
          ? (promptTokens ?? 0) + (completionTokens ?? 0)
          : null;
    events.push({
      ...base,
      type: "usage.final",
      sequence: sequence.value++,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
      },
      at,
    });
  }

  return { events, done: false };
}
