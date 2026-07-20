/**
 * OpenAI wire → canonical response mapping helpers.
 */

import type {
  ProviderAdapterRequest,
  ProviderWirePayload,
  ProviderAdapterResponse,
} from "../../adapters/contracts/adapter-io";
import type { CanonicalFinishReason } from "../../adapters/contracts/enums";

export function mapOpenAIResponseToCanonical(
  raw: ProviderWirePayload,
  request: ProviderAdapterRequest,
  latencyMs: number,
  nowIso: string
): ProviderAdapterResponse {
  const choices = raw.choices as Array<Record<string, unknown>> | undefined;
  const choice = choices?.[0];
  const message = (choice?.message as Record<string, unknown>) ?? {};
  const finish = String(choice?.finish_reason ?? "stop");

  const usage = (raw.usage as Record<string, unknown>) ?? {};
  const details = (usage.completion_tokens_details as Record<string, unknown>) ?? {};

  const output: Record<string, unknown> = {
    content: message.content ?? raw.data ?? raw.results ?? raw,
  };
  if (message.tool_calls) output.tool_calls = message.tool_calls;
  if (Array.isArray(raw.data) && (raw.data as unknown[])[0] && "embedding" in ((raw.data as Array<Record<string, unknown>>)[0] ?? {})) {
    output.embeddings = raw.data;
  }

  return Object.freeze({
    requestId: request.requestId,
    providerId: request.providerId,
    adapterId: request.adapterId,
    modelId: String(raw.model ?? request.modelId),
    output: Object.freeze(output),
    finishReason: mapFinishReason(finish),
    usage: Object.freeze({
      promptTokens: numberOrUndef(usage.prompt_tokens),
      completionTokens: numberOrUndef(usage.completion_tokens),
      totalTokens: numberOrUndef(usage.total_tokens),
      reasoningTokens: numberOrUndef(details.reasoning_tokens),
    }),
    latencyMs,
    warnings: [],
    safety: [],
    streamed: Boolean(request.streaming),
    createdAt: nowIso,
  });
}

function mapFinishReason(finish: string): CanonicalFinishReason {
  switch (finish) {
    case "stop":
      return "stop";
    case "length":
      return "length";
    case "content_filter":
      return "content_filter";
    case "tool_calls":
    case "function_call":
      return "tool_call";
    default:
      return "unknown";
  }
}

function numberOrUndef(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}
