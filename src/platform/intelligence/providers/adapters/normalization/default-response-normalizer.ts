/**
 * Default response normalizer.
 *
 * Purpose: Turn an opaque provider-shaped payload into a canonical response.
 * Responsibilities: Canonicalize finish reasons, usage, latency, warnings,
 *   safety markers, reasoning, and streaming metadata.
 * Usage: Delegated to by AbstractProviderAdapter.normalizeResponse.
 * Future Extension: Per-modality output canonicalization strategies.
 *
 * Reads only generic keys — never imports or references a vendor SDK type.
 */

import { success, type Result } from "../../../shared/result";
import type {
  ProviderAdapterRequest,
  ProviderAdapterResponse,
  ProviderSafetyMarker,
  ProviderStreamingMetadata,
  ProviderTokenUsage,
  ProviderWirePayload,
} from "../contracts/adapter-io";
import type { ProviderDiagnostic } from "../contracts/diagnostics";
import type { CanonicalFinishReason } from "../contracts/enums";
import type { ProviderNormalizationResult } from "../contracts/results";
import type { IResponseNormalizer } from "../interfaces/validation";

const FINISH_MAP: Readonly<Record<string, CanonicalFinishReason>> = {
  stop: "stop",
  end_turn: "stop",
  complete: "stop",
  completed: "stop",
  eos: "stop",
  length: "length",
  max_tokens: "length",
  max_output_tokens: "length",
  content_filter: "content_filter",
  safety: "content_filter",
  filtered: "content_filter",
  tool_calls: "tool_call",
  tool_use: "tool_call",
  function_call: "tool_call",
  cancelled: "cancelled",
  canceled: "cancelled",
  error: "error",
};

function num(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function pick(source: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (source[key] !== undefined) {
      return source[key];
    }
  }
  return undefined;
}

function normalizeFinish(raw: Record<string, unknown>): CanonicalFinishReason {
  const value = pick(raw, ["finishReason", "finish_reason", "stop_reason", "stopReason"]);
  if (typeof value === "string" && FINISH_MAP[value.toLowerCase()]) {
    return FINISH_MAP[value.toLowerCase()];
  }
  return "unknown";
}

function normalizeUsage(
  raw: Record<string, unknown>,
  normalizedFields: string[]
): ProviderTokenUsage | undefined {
  const usageRaw = raw.usage;
  if (!usageRaw || typeof usageRaw !== "object") {
    return undefined;
  }
  const u = usageRaw as Record<string, unknown>;
  normalizedFields.push("usage");
  return {
    promptTokens: num(pick(u, ["promptTokens", "prompt_tokens", "input_tokens", "inputTokens"])),
    completionTokens: num(
      pick(u, ["completionTokens", "completion_tokens", "output_tokens", "outputTokens"])
    ),
    totalTokens: num(pick(u, ["totalTokens", "total_tokens"])),
    reasoningTokens: num(pick(u, ["reasoningTokens", "reasoning_tokens"])),
  };
}

function normalizeSafety(raw: Record<string, unknown>): readonly ProviderSafetyMarker[] {
  const safety = raw.safety ?? raw.safetyRatings ?? raw.safety_ratings;
  if (!Array.isArray(safety)) {
    return [];
  }
  return safety.map((entry) => {
    const record = (entry ?? {}) as Record<string, unknown>;
    return {
      category: String(record.category ?? record.name ?? "unknown"),
      flagged: Boolean(record.flagged ?? record.blocked ?? false),
      score: num(record.score ?? record.probability),
      action: typeof record.action === "string" ? record.action : undefined,
    };
  });
}

function normalizeStreaming(
  raw: Record<string, unknown>,
  streamed: boolean
): ProviderStreamingMetadata | undefined {
  if (!streamed) {
    return undefined;
  }
  const meta = (raw.streaming ?? {}) as Record<string, unknown>;
  return {
    chunkCount: num(meta.chunkCount ?? meta.chunk_count) ?? 0,
    firstChunkAtMs: num(meta.firstChunkAtMs ?? meta.first_chunk_at_ms),
    completed: Boolean(meta.completed ?? true),
    heartbeats: num(meta.heartbeats) ?? 0,
  };
}

export class DefaultResponseNormalizer implements IResponseNormalizer {
  constructor(private readonly nowIso: () => string = () => new Date().toISOString()) {}

  normalize(
    raw: ProviderWirePayload,
    request: ProviderAdapterRequest
  ): Result<ProviderNormalizationResult> {
    const source = raw as Record<string, unknown>;
    const normalizedFields: string[] = [];
    const warnings: ProviderDiagnostic[] = [];

    const output =
      (source.output as Record<string, unknown> | undefined) ??
      (source.content !== undefined ? { content: source.content } : undefined) ??
      {};
    normalizedFields.push("output");

    const finishReason = normalizeFinish(source);
    if (finishReason === "unknown" && source.finishReason === undefined) {
      warnings.push({
        code: "finish_reason_missing",
        message: "no finish reason present; defaulted to 'unknown'",
        severity: "info",
        source: "normalizer",
      });
    }
    normalizedFields.push("finishReason");

    const usage = normalizeUsage(source, normalizedFields);
    const streamed = Boolean(source.streamed ?? request.streaming);
    const streaming = normalizeStreaming(source, streamed);
    const latencyMs = num(pick(source, ["latencyMs", "latency_ms"]));
    const reasoning =
      source.reasoning && typeof source.reasoning === "object"
        ? (source.reasoning as Record<string, unknown>)
        : undefined;

    const response: ProviderAdapterResponse = {
      requestId: request.requestId,
      providerId: request.providerId,
      adapterId: request.adapterId,
      modelId: request.modelId,
      output,
      finishReason,
      usage,
      latencyMs,
      warnings,
      safety: normalizeSafety(source),
      reasoning,
      streamed,
      streaming,
      createdAt: this.nowIso(),
    };

    return success({ response, warnings, normalizedFields });
  }
}
