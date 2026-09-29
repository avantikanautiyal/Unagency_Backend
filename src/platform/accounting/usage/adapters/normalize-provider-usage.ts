/**
 * Provider usage normalization adapters.
 *
 * Maps each vendor's response usage shape onto NormalizedAIUsage using the
 * field names documented by that provider (Anthropic input_tokens, Gemini
 * usageMetadata, DeepSeek cache hit/miss, xAI cost_in_usd_ticks, etc.).
 */

import type { NormalizedAIUsage, NormalizedUsageUnit } from "../../contracts/ai-usage";
import { PRICING_UNIT } from "../../contracts/enums";
import { usdTicksToUsdString } from "../../money/usd-money";

function num(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Keep usage metrics (incl. *_tokens / cost ticks) for audit/recalc.
 * Only strip secrets and free-text payloads.
 */
function sanitizeRawUsage(raw: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const k = key.toLowerCase();
    if (/(?:^|[_-])(secret|password|authorization|credential|bearer|api[_-]?key)(?:$|[_-])/i.test(k)) {
      continue;
    }
    if (
      k === "prompt" ||
      k === "content" ||
      k === "message" ||
      k === "messages" ||
      k === "input" ||
      k === "output" ||
      k === "system"
    ) {
      continue;
    }
    safe[key] = value;
  }
  return Object.keys(safe).length > 0 ? safe : null;
}

function extractProviderReportedCostUsd(raw: Record<string, unknown>): string | null {
  const ticks = raw.cost_in_usd_ticks ?? raw.costInUsdTicks;
  const fromTicks = usdTicksToUsdString(ticks as number | string | bigint | null | undefined);
  if (fromTicks != null) return fromTicks;

  const direct =
    raw.cost_usd ??
    raw.costUsd ??
    raw.provider_cost_usd ??
    raw.providerReportedCostUsd;
  if (direct == null) return null;
  const n = Number(direct);
  return Number.isFinite(n) && n >= 0 ? String(n) : null;
}

function baseUsage(
  raw: Record<string, unknown> | null | undefined,
  fields: Partial<NormalizedAIUsage>
): NormalizedAIUsage {
  const providerReportedCostUsd =
    fields.providerReportedCostUsd ?? (raw ? extractProviderReportedCostUsd(raw) : null);
  return {
    inputTokens: fields.inputTokens ?? null,
    outputTokens: fields.outputTokens ?? null,
    cachedInputTokens: fields.cachedInputTokens ?? null,
    cachedOutputTokens: fields.cachedOutputTokens ?? null,
    reasoningTokens: fields.reasoningTokens ?? null,
    totalTokens: fields.totalTokens ?? null,
    otherUnits: fields.otherUnits ?? [],
    providerReportedCostUsd,
    providerRequestId: fields.providerRequestId ?? null,
    rawProviderUsage: sanitizeRawUsage(raw),
  };
}

export function normalizeOpenAiUsage(
  usage: Record<string, unknown> | null | undefined,
  providerRequestId?: string | null
): NormalizedAIUsage {
  const raw = usage ?? {};
  const prompt = num(raw.prompt_tokens ?? raw.input_tokens ?? raw.promptTokens ?? raw.inputTokens);
  const completion = num(
    raw.completion_tokens ?? raw.output_tokens ?? raw.completionTokens ?? raw.outputTokens
  );
  const total = num(raw.total_tokens ?? raw.totalTokens);
  const details = (raw.prompt_tokens_details as Record<string, unknown>) ?? {};
  const completionDetails = (raw.completion_tokens_details as Record<string, unknown>) ?? {};
  const cached = num(
    details.cached_tokens ??
      raw.cached_tokens ??
      raw.cachedTokens ??
      raw.prompt_cache_hit_tokens
  );
  const reasoning = num(
    completionDetails.reasoning_tokens ?? raw.reasoning_tokens ?? raw.reasoningTokens
  );

  return baseUsage(raw, {
    inputTokens: prompt,
    outputTokens: completion,
    cachedInputTokens: cached,
    reasoningTokens: reasoning,
    totalTokens: total,
    providerRequestId: providerRequestId ?? null,
  });
}

export function normalizeAnthropicUsage(
  usage: Record<string, unknown> | null | undefined,
  providerRequestId?: string | null
): NormalizedAIUsage {
  const raw = usage ?? {};
  // Anthropic Messages API: input_tokens / output_tokens.
  // Canonical ledger path often carries promptTokens / completionTokens.
  const input = num(
    raw.input_tokens ?? raw.inputTokens ?? raw.prompt_tokens ?? raw.promptTokens
  );
  const output = num(
    raw.output_tokens ?? raw.outputTokens ?? raw.completion_tokens ?? raw.completionTokens
  );
  const cacheRead = num(raw.cache_read_input_tokens ?? raw.cacheReadInputTokens);
  const cacheCreate = num(raw.cache_creation_input_tokens ?? raw.cacheCreationInputTokens);

  return baseUsage(raw, {
    inputTokens: input,
    outputTokens: output,
    cachedInputTokens: cacheRead ?? cacheCreate,
    totalTokens: input != null && output != null ? input + output : null,
    providerRequestId: providerRequestId ?? null,
  });
}

export function normalizeGeminiUsage(
  usage: Record<string, unknown> | null | undefined,
  providerRequestId?: string | null
): NormalizedAIUsage {
  const raw = usage ?? {};
  const metadata = (raw.usageMetadata as Record<string, unknown>) ?? raw;
  const prompt = num(
    metadata.promptTokenCount ??
      metadata.prompt_tokens ??
      metadata.promptTokens ??
      raw.promptTokens ??
      raw.prompt_tokens
  );
  const completion = num(
    metadata.candidatesTokenCount ??
      metadata.completion_tokens ??
      metadata.completionTokens ??
      raw.completionTokens ??
      raw.completion_tokens
  );
  const cached = num(metadata.cachedContentTokenCount ?? metadata.cached_tokens ?? raw.cachedTokens);
  const reasoning = num(
    metadata.thoughtsTokenCount ?? metadata.reasoning_tokens ?? raw.reasoningTokens
  );
  const total = num(metadata.totalTokenCount ?? metadata.total_tokens ?? raw.totalTokens);

  return baseUsage(raw, {
    inputTokens: prompt,
    outputTokens: completion,
    cachedInputTokens: cached,
    reasoningTokens: reasoning,
    totalTokens: total,
    providerRequestId: providerRequestId ?? null,
  });
}

/**
 * DeepSeek bills cache-hit and cache-miss input separately
 * (prompt_cache_hit_tokens / prompt_cache_miss_tokens).
 * See https://api-docs.deepseek.com/guides/kv_cache/
 */
export function normalizeDeepSeekUsage(
  usage: Record<string, unknown> | null | undefined,
  providerRequestId?: string | null
): NormalizedAIUsage {
  const raw = usage ?? {};
  const cacheHit = num(raw.prompt_cache_hit_tokens ?? raw.promptCacheHitTokens);
  const cacheMiss = num(raw.prompt_cache_miss_tokens ?? raw.promptCacheMissTokens);
  const prompt = num(raw.prompt_tokens ?? raw.promptTokens ?? raw.input_tokens);
  const completion = num(
    raw.completion_tokens ?? raw.completionTokens ?? raw.output_tokens ?? raw.outputTokens
  );
  const reasoning = num(
    (raw.completion_tokens_details as Record<string, unknown> | undefined)?.reasoning_tokens ??
      raw.reasoning_tokens ??
      raw.reasoningTokens
  );
  const total = num(raw.total_tokens ?? raw.totalTokens);

  const inputTokens =
    cacheMiss != null
      ? cacheMiss
      : cacheHit != null && prompt != null
        ? Math.max(0, prompt - cacheHit)
        : prompt;

  return baseUsage(raw, {
    inputTokens,
    outputTokens: completion,
    cachedInputTokens: cacheHit,
    reasoningTokens: reasoning,
    totalTokens: total,
    providerRequestId: providerRequestId ?? null,
  });
}

export function normalizeCompatTextUsage(
  usage: Record<string, unknown> | null | undefined,
  providerRequestId?: string | null
): NormalizedAIUsage {
  return normalizeOpenAiUsage(usage, providerRequestId);
}

export function normalizeImageUsage(
  usage: Record<string, unknown> | null | undefined,
  providerRequestId?: string | null
): NormalizedAIUsage {
  const raw = usage ?? {};
  const images = num(raw.images ?? raw.image_count ?? raw.generations ?? 1);
  const otherUnits: NormalizedUsageUnit[] = [];
  if (images != null && images > 0) {
    otherUnits.push({ unit: PRICING_UNIT.IMAGE, quantity: images });
  }
  return baseUsage(raw, {
    otherUnits,
    providerRequestId: providerRequestId ?? null,
  });
}

export function normalizeAudioUsage(
  usage: Record<string, unknown> | null | undefined,
  providerRequestId?: string | null
): NormalizedAIUsage {
  const raw = usage ?? {};
  const otherUnits: NormalizedUsageUnit[] = [];
  const characters = num(raw.characters);
  const seconds = num(raw.transcriptionSeconds ?? raw.seconds ?? raw.duration_seconds);
  if (characters != null && characters > 0) {
    otherUnits.push({ unit: PRICING_UNIT.AUDIO_CHARACTER, quantity: characters });
  }
  if (seconds != null && seconds > 0) {
    otherUnits.push({ unit: PRICING_UNIT.AUDIO_SECOND, quantity: seconds });
  }
  return baseUsage(raw, {
    otherUnits,
    providerRequestId: providerRequestId ?? null,
  });
}

export function normalizeVideoUsage(
  usage: Record<string, unknown> | null | undefined,
  providerRequestId?: string | null
): NormalizedAIUsage {
  const raw = usage ?? {};
  const otherUnits: NormalizedUsageUnit[] = [];
  const seconds = num(raw.seconds ?? raw.duration_seconds ?? raw.video_seconds);
  const generations = num(raw.generations ?? raw.video_count);
  if (seconds != null && seconds > 0) {
    otherUnits.push({ unit: PRICING_UNIT.VIDEO_SECOND, quantity: seconds });
  } else if (generations != null && generations > 0) {
    otherUnits.push({ unit: PRICING_UNIT.REQUEST, quantity: generations });
  }
  return baseUsage(raw, {
    otherUnits,
    providerRequestId: providerRequestId ?? null,
  });
}

export function normalizeResearchUsage(
  usage: Record<string, unknown> | null | undefined,
  providerRequestId?: string | null
): NormalizedAIUsage {
  const raw = usage ?? {};
  const requests = num(raw.requests ?? raw.search_count ?? 1);
  const otherUnits: NormalizedUsageUnit[] = [];
  if (requests != null && requests > 0) {
    otherUnits.push({ unit: PRICING_UNIT.REQUEST, quantity: requests });
  }
  return baseUsage(raw, {
    otherUnits,
    providerRequestId: providerRequestId ?? null,
  });
}

export function normalizeProviderUsage(input: {
  readonly providerId: string;
  readonly capabilityId: string;
  readonly usage?: Readonly<Record<string, unknown>> | null;
  readonly providerRequestId?: string | null;
}): NormalizedAIUsage {
  const usage = (input.usage ?? null) as Record<string, unknown> | null;
  const providerRequestId = str(input.providerRequestId) ?? str(usage?.providerRequestId);

  if (input.capabilityId.includes("image")) {
    return normalizeImageUsage(usage, providerRequestId);
  }
  if (input.capabilityId.includes("video")) {
    return normalizeVideoUsage(usage, providerRequestId);
  }
  if (input.capabilityId.includes("audio")) {
    return normalizeAudioUsage(usage, providerRequestId);
  }
  if (input.capabilityId.includes("research") || input.capabilityId.includes("search")) {
    return normalizeResearchUsage(usage, providerRequestId);
  }
  if (input.capabilityId.includes("embedding")) {
    const normalized = normalizeOpenAiUsage(usage, providerRequestId);
    const otherUnits: NormalizedUsageUnit[] = [];
    const tokens = normalized.inputTokens ?? normalized.totalTokens;
    if (tokens != null && tokens > 0) {
      otherUnits.push({ unit: PRICING_UNIT.EMBEDDING_TOKEN_PER_1M, quantity: tokens });
    }
    return { ...normalized, otherUnits: [...normalized.otherUnits, ...otherUnits] };
  }

  const provider = input.providerId.toLowerCase();
  if (provider.includes("anthropic")) {
    return normalizeAnthropicUsage(usage, providerRequestId);
  }
  if (provider.includes("gemini") || provider.includes("google")) {
    return normalizeGeminiUsage(usage, providerRequestId);
  }
  if (provider.includes("deepseek")) {
    return normalizeDeepSeekUsage(usage, providerRequestId);
  }

  return normalizeCompatTextUsage(usage, providerRequestId);
}

export function normalizeFromCanonicalUsage(
  usage: Readonly<Record<string, unknown>> | undefined,
  providerId: string,
  capabilityId: string,
  providerRequestId?: string | null
): NormalizedAIUsage {
  const raw = usage ?? {};
  // Flatten canonical camelCase + vendor snake_case so every normalizer can read either.
  const mapped: Record<string, unknown> = {
    ...raw,
    prompt_tokens: raw.promptTokens ?? raw.prompt_tokens ?? raw.input_tokens ?? raw.inputTokens,
    completion_tokens:
      raw.completionTokens ?? raw.completion_tokens ?? raw.output_tokens ?? raw.outputTokens,
    input_tokens: raw.input_tokens ?? raw.inputTokens ?? raw.promptTokens ?? raw.prompt_tokens,
    output_tokens: raw.output_tokens ?? raw.outputTokens ?? raw.completionTokens ?? raw.completion_tokens,
    total_tokens: raw.totalTokens ?? raw.total_tokens,
    reasoning_tokens: raw.reasoningTokens ?? raw.reasoning_tokens,
    cached_tokens: raw.cachedTokens ?? raw.cached_tokens,
    prompt_cache_hit_tokens: raw.promptCacheHitTokens ?? raw.prompt_cache_hit_tokens,
    prompt_cache_miss_tokens: raw.promptCacheMissTokens ?? raw.prompt_cache_miss_tokens,
    cache_read_input_tokens: raw.cacheReadInputTokens ?? raw.cache_read_input_tokens,
    cache_creation_input_tokens: raw.cacheCreationInputTokens ?? raw.cache_creation_input_tokens,
    cost_in_usd_ticks: raw.costInUsdTicks ?? raw.cost_in_usd_ticks,
    cost_usd: raw.costUsd ?? raw.cost_usd,
    characters: raw.characters,
    transcriptionSeconds: raw.transcriptionSeconds,
    images: raw.images,
    seconds: raw.seconds,
    requests: raw.requests,
  };

  return normalizeProviderUsage({
    providerId,
    capabilityId,
    usage: mapped,
    providerRequestId: providerRequestId ?? str(raw.providerRequestId),
  });
}
