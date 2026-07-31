/**
 * OpenAI wire → canonical response mapping helpers.
 */

import type {
  ProviderAdapterRequest,
  ProviderWirePayload,
  ProviderAdapterResponse,
  ProviderTokenUsage,
} from "../../adapters/contracts/adapter-io";
import type { CanonicalFinishReason } from "../../adapters/contracts/enums";
import {
  attachMediaOutputs,
  mapBinaryAudioToOutput,
  mapOpenAIImageDataToOutputs,
  mapTranscriptToOutput,
  normalizeAudioUsage,
  normalizeImageUsage,
} from "../../common/media-output";
import {
  attachEmbeddingOutputs,
  mapOpenAICompatibleEmbeddingData,
} from "../../common/embedding-output";
import {
  isEmbeddingCapability,
  normalizeAudioCapabilityId,
} from "../../common/resolve-execution-modality";

export function mapOpenAIResponseToCanonical(
  raw: ProviderWirePayload,
  request: ProviderAdapterRequest,
  latencyMs: number,
  nowIso: string
): ProviderAdapterResponse {
  const operation = String((raw as Record<string, unknown>).operation ?? "");
  const cap = normalizeAudioCapabilityId(String(request.capabilityId ?? ""));

  if (
    isEmbeddingCapability(String(request.capabilityId ?? "")) ||
    request.modality === "embedding" ||
    operation === "embeddings"
  ) {
    const mapped = mapOpenAICompatibleEmbeddingData({
      data: raw.data,
      model: request.modelId || String(raw.model ?? request.modelId),
      provider: String(request.providerId),
    });
    if (!mapped.ok) {
      throw mapped.error;
    }
    const usage = (raw.usage as Record<string, unknown>) ?? {};
    return Object.freeze({
      requestId: request.requestId,
      providerId: request.providerId,
      adapterId: request.adapterId,
      modelId: request.modelId || String(raw.model ?? request.modelId),
      output: attachEmbeddingOutputs({}, mapped.value),
      finishReason: "stop" as const,
      usage: Object.freeze({
        promptTokens: numberOrUndef(usage.prompt_tokens),
        totalTokens: numberOrUndef(usage.total_tokens),
      }) as ProviderTokenUsage,
      latencyMs,
      warnings: [],
      safety: [],
      streamed: false,
      createdAt: nowIso,
    });
  }

  if (cap === "audio.transcribe" || operation === "audio.transcriptions") {
    const text = typeof raw.text === "string" ? raw.text : String(raw.text ?? "");
    const output = mapTranscriptToOutput({
      text,
      language: typeof raw.language === "string" ? raw.language : undefined,
      durationSeconds: typeof raw.duration === "number" ? raw.duration : undefined,
      segments: Array.isArray(raw.segments) ? raw.segments : undefined,
    });
    return Object.freeze({
      requestId: request.requestId,
      providerId: request.providerId,
      adapterId: request.adapterId,
      modelId: request.modelId || String(raw.model ?? request.modelId),
      output: Object.freeze(output),
      finishReason: "stop",
      usage: Object.freeze({
        ...(normalizeAudioUsage(raw.usage as Record<string, unknown> | undefined) ?? {}),
        transcriptionSeconds:
          typeof raw.duration === "number" ? raw.duration : undefined,
      }) as ProviderTokenUsage,
      latencyMs,
      warnings: [],
      safety: [],
      streamed: false,
      createdAt: nowIso,
    });
  }

  if (cap === "audio.synthesize" || operation === "audio.speech") {
    const mimeType =
      typeof raw._contentType === "string" ? raw._contentType : "audio/mpeg";
    const url = typeof raw._audioUrl === "string" ? raw._audioUrl : undefined;
    const storageRef =
      typeof raw._audioStorageRef === "string" ? raw._audioStorageRef : undefined;
    const mediaOutputs = [
      mapBinaryAudioToOutput({
        mimeType,
        url,
        storageRef,
        metadata: { provider: "openai", operation: "audio.speech" },
      }),
    ];
    const baseOutput: Record<string, unknown> = { content: "[audio]" };
    const output = attachMediaOutputs(baseOutput, mediaOutputs);
    return Object.freeze({
      requestId: request.requestId,
      providerId: request.providerId,
      adapterId: request.adapterId,
      modelId: request.modelId || String(raw.model ?? request.modelId),
      output,
      finishReason: "stop",
      usage: Object.freeze({
        ...(normalizeAudioUsage(raw.usage as Record<string, unknown> | undefined) ?? {}),
        characters:
          typeof raw._inputCharacters === "number" ? raw._inputCharacters : undefined,
      }) as ProviderTokenUsage,
      latencyMs,
      warnings: [],
      safety: [],
      streamed: false,
      createdAt: nowIso,
    });
  }

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
  if (Array.isArray(raw.data) && (raw.data as unknown[])[0]) {
    const first = (raw.data as Array<Record<string, unknown>>)[0] ?? {};
    if ("embedding" in first) {
      const mapped = mapOpenAICompatibleEmbeddingData({
        data: raw.data,
        model: request.modelId || String(raw.model ?? request.modelId),
        provider: String(request.providerId),
      });
      if (!mapped.ok) {
        throw mapped.error;
      }
      Object.assign(output, attachEmbeddingOutputs({}, mapped.value));
    } else if ("url" in first || "b64_json" in first) {
      const mediaOutputs = mapOpenAIImageDataToOutputs(raw);
      Object.assign(output, attachMediaOutputs(output, mediaOutputs));
    }
  }

  return Object.freeze({
    requestId: request.requestId,
    providerId: request.providerId,
    adapterId: request.adapterId,
    // Preserve canonical modelId identity; raw.model is the wire-model id.
    modelId: request.modelId || String(raw.model ?? request.modelId),
    output: Object.freeze(output),
    finishReason: mapFinishReason(finish),
    usage: Object.freeze({
      promptTokens: numberOrUndef(usage.prompt_tokens),
      completionTokens: numberOrUndef(usage.completion_tokens),
      totalTokens: numberOrUndef(usage.total_tokens),
      reasoningTokens: numberOrUndef(details.reasoning_tokens),
      ...(normalizeImageUsage(raw) ?? {}),
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
