/**
 * Anthropic wire → canonical response mapping.
 */

import type {
  ProviderAdapterRequest,
  ProviderWirePayload,
  ProviderAdapterResponse,
} from "../../adapters/contracts/adapter-io";
import type { CanonicalFinishReason } from "../../adapters/contracts/enums";

export function mapAnthropicResponseToCanonical(
  raw: ProviderWirePayload,
  request: ProviderAdapterRequest,
  latencyMs: number,
  nowIso: string
): ProviderAdapterResponse {
  const contentBlocks = raw.content as Array<Record<string, unknown>> | undefined;
  const text =
    contentBlocks
      ?.map((b) => (b.type === "text" ? String(b.text ?? "") : ""))
      .join("") ?? "";

  const usage = (raw.usage as Record<string, unknown>) ?? {};
  const stopReason = String(raw.stop_reason ?? "end_turn");

  return Object.freeze({
    requestId: request.requestId,
    providerId: request.providerId,
    adapterId: request.adapterId,
    modelId: request.modelId,
    output: Object.freeze({ content: text }),
    finishReason: mapFinishReason(stopReason),
    usage: Object.freeze({
      promptTokens: numberOrUndef(usage.input_tokens),
      completionTokens: numberOrUndef(usage.output_tokens),
      totalTokens:
        numberOrUndef(usage.input_tokens) !== undefined &&
        numberOrUndef(usage.output_tokens) !== undefined
          ? (usage.input_tokens as number) + (usage.output_tokens as number)
          : undefined,
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
    case "end_turn":
    case "stop_sequence":
      return "stop";
    case "max_tokens":
      return "length";
    case "tool_use":
      return "tool_call";
    default:
      return "unknown";
  }
}

function numberOrUndef(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}
