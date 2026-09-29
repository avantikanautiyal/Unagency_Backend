/**
 * Shared helpers for provider billing adapters (xAI, Runway, ElevenLabs, Gemini).
 */

export interface BillingFetchOptions {
  readonly fetchImpl?: typeof fetch;
  readonly maxRetries?: number;
}

/** JSON request with 429 backoff and retry on transient failures. */
export async function fetchBillingJson(
  label: string,
  url: string,
  init: RequestInit,
  options: BillingFetchOptions = {}
): Promise<unknown> {
  const fetchFn = options.fetchImpl ?? fetch;
  const maxRetries = options.maxRetries ?? 3;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      const response = await fetchFn(url, init);

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after") ?? "2");
        await sleep(Math.min(Number.isFinite(retryAfter) ? retryAfter : 2, 30) * 1000);
        continue;
      }

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`${label} HTTP ${response.status}: ${text.slice(0, 500)}`);
      }

      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries - 1) {
        await sleep(Math.pow(2, attempt) * 500);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Split [startMs, endMs) into consecutive windows no longer than maxDays. */
export function splitWindow(
  startMs: number,
  endMs: number,
  maxDays: number
): Array<{ startMs: number; endMs: number }> {
  const step = maxDays * 86_400_000;
  const windows: Array<{ startMs: number; endMs: number }> = [];
  for (let cursor = startMs; cursor < endMs; cursor += step) {
    windows.push({ startMs: cursor, endMs: Math.min(cursor + step, endMs) });
  }
  return windows;
}

/** "2025-08-01T00:00:00Z" → "2025-08-01T00:00:00.000Z" so ISO strings compare correctly in Mongo. */
export function normalizeIso(value: unknown): string | null {
  if (value == null || value === "") return null;
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** YYYY-MM-DD (UTC) → [bucket start, next-day bucket end] ISO pair. */
export function utcDayBucket(day: string): { start: string; end: string } | null {
  const ms = Date.parse(`${day.slice(0, 10)}T00:00:00.000Z`);
  if (!Number.isFinite(ms)) return null;
  return {
    start: new Date(ms).toISOString(),
    end: new Date(ms + 86_400_000).toISOString(),
  };
}

/** Plain decimal string (no exponent, no trailing zeros) that parseUsdToMicro accepts. */
export function toPlainDecimal(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const fixed = value.toFixed(8).replace(/\.?0+$/, "");
  return fixed === "" || fixed === "-0" ? "0" : fixed;
}

/** Positive number from env, else the fallback. */
export function envPositiveNumber(name: string, fallback: number | null): number | null {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function envList(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
