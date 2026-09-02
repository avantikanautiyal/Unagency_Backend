/**
 * Provider usage normalization adapters.
 */

import type { NormalizedAIUsage, NormalizedUsageUnit } from "../../contracts/ai-usage";
import { PRICING_UNIT } from "../../contracts/enums";

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

function sanitizeRawUsage(raw: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (/key|token|secret|password|authorization|prompt|content|message/i.test(key)) {
      continue;
    }
    safe[key] = value;
  }
  return Object.keys(safe).length > 0 ? safe : null;
}

function baseUsage(
  raw: Record<string, unknown> | null | undefined,
  fields: Partial<NormalizedAIUsage>
): NormalizedAIUsage {
  return {
    inputTokens: fields.inputTokens ?? null,
    outputTokens: fields.outputTokens ?? null,
    cachedInputTokens: fields.cachedInputTokens ?? null,
    cachedOutputTokens: fields.cachedOutputTokens ?? null,
    reasoningTokens: fields.reasoningTokens ?? null,
    totalTokens: fields.totalTokens ?? null,
    otherUnits: fields.otherUnits ?? [],
    providerRequestId: fields.providerRequestId ?? null,
    rawProviderUsage: sanitizeRawUsage(raw),
  };
}

export function normalizeOpenAiUsage(
  usage: Record<string, unknown> | null | undefined,
  providerRequestId?: string | null
): NormalizedAIUsage {
  const raw = usage ?? {};
  const prompt = num(raw.prompt_tokens ?? raw.input_tokens);
  const completion = num(raw.completion_tokens ?? raw.output_tokens);
  const total = num(raw.total_tokens);
  const details = (raw.prompt_tokens_details as Record<string, unknown>) ?? {};
  const completionDetails = (raw.completion_tokens_details as Record<string, unknown>) ?? {};
  const cached = num(details.cached_tokens ?? raw.cached_tokens);
  const reasoning = num(completionDetails.reasoning_tokens ?? raw.reasoning_tokens);

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
  const input = num(raw.input_tokens);
  const output = num(raw.output_tokens);
  const cacheRead = num(raw.cache_read_input_tokens);
  const cacheCreate = num(raw.cache_creation_input_tokens);

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
  const prompt = num(metadata.promptTokenCount ?? metadata.prompt_tokens);
  const completion = num(metadata.candidatesTokenCount ?? metadata.completion_tokens);
  const cached = num(metadata.cachedContentTokenCount);
  const total = num(metadata.totalTokenCount ?? metadata.total_tokens);

  return baseUsage(raw, {
    inputTokens: prompt,
    outputTokens: completion,
    cachedInputTokens: cached,
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

  return normalizeCompatTextUsage(usage, providerRequestId);
}

export function normalizeFromCanonicalUsage(
  usage: Readonly<Record<string, unknown>> | undefined,
  providerId: string,
  capabilityId: string,
  providerRequestId?: string | null
): NormalizedAIUsage {
  const raw = usage ?? {};
  const mapped: Record<string, unknown> = {
    ...raw,
    prompt_tokens: raw.promptTokens ?? raw.prompt_tokens,
    completion_tokens: raw.completionTokens ?? raw.completion_tokens,
    total_tokens: raw.totalTokens ?? raw.total_tokens,
    reasoning_tokens: raw.reasoningTokens ?? raw.reasoning_tokens,
    cached_tokens: raw.cachedTokens ?? raw.cached_tokens,
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
