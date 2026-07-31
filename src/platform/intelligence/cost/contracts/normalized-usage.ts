/**
 * M9.5Q — Canonical provider-neutral usage.
 * Missing = null/absent. Never use 0 to mean unknown.
 */

export interface NormalizedUsage {
  readonly promptTokens?: number | null;
  readonly completionTokens?: number | null;
  readonly totalTokens?: number | null;
  readonly cachedInputTokens?: number | null;
  readonly reasoningTokens?: number | null;
  readonly characters?: number | null;
  readonly transcriptionSeconds?: number | null;
  readonly audioSeconds?: number | null;
  readonly imagesGenerated?: number | null;
  readonly videoSeconds?: number | null;
  readonly computeUnits?: number | null;
  readonly requests?: number | null;
}

const FINITE_NON_NEG = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;

/**
 * Normalize opaque provider usage into canonical dimensions.
 * Invalid (negative / NaN / Infinity) fields are dropped — never invented.
 */
export function normalizeUsage(
  raw: Readonly<Record<string, unknown>> | undefined | null
): NormalizedUsage | null {
  if (!raw || typeof raw !== "object") return null;

  const promptTokens =
    pick(raw, ["promptTokens", "inputTokens", "prompt_tokens", "input"]) ?? null;
  const completionTokens =
    pick(raw, ["completionTokens", "outputTokens", "completion_tokens", "output"]) ??
    null;
  const totalTokens =
    pick(raw, ["totalTokens", "total_tokens", "tokens"]) ??
    (promptTokens != null || completionTokens != null
      ? (promptTokens ?? 0) + (completionTokens ?? 0)
      : null);
  const cachedInputTokens =
    pick(raw, ["cachedInputTokens", "cached_tokens", "cachedTokens"]) ?? null;
  const reasoningTokens =
    pick(raw, ["reasoningTokens", "reasoning_tokens"]) ?? null;
  const characters = pick(raw, ["characters", "characterCount"]) ?? null;
  const transcriptionSeconds =
    pick(raw, ["transcriptionSeconds", "transcription_seconds"]) ?? null;
  const audioSeconds =
    pick(raw, ["audioSeconds", "audio_seconds", "durationSeconds"]) ?? null;
  const imagesGenerated =
    pick(raw, ["imagesGenerated", "imageCount", "images"]) ?? null;
  const videoSeconds =
    pick(raw, ["videoSeconds", "video_seconds", "duration"]) ?? null;
  const computeUnits = pick(raw, ["computeUnits", "compute_units"]) ?? null;
  const requests = pick(raw, ["requests", "requestCount"]) ?? null;

  const out: NormalizedUsage = {
    promptTokens,
    completionTokens,
    totalTokens,
    cachedInputTokens,
    reasoningTokens,
    characters,
    transcriptionSeconds,
    audioSeconds,
    imagesGenerated,
    videoSeconds,
    computeUnits,
    requests,
  };

  const any = Object.values(out).some((v) => v != null);
  return any ? out : null;
}

function pick(
  raw: Readonly<Record<string, unknown>>,
  keys: readonly string[]
): number | undefined {
  for (const k of keys) {
    const v = raw[k];
    if (FINITE_NON_NEG(v)) return v;
  }
  return undefined;
}

/** True when usage contains invalid numeric values that must be rejected. */
export function usageHasInvalidNumbers(
  raw: Readonly<Record<string, unknown>> | undefined | null
): boolean {
  if (!raw) return false;
  for (const v of Object.values(raw)) {
    if (typeof v !== "number") continue;
    if (!Number.isFinite(v) || v < 0) return true;
  }
  return false;
}
