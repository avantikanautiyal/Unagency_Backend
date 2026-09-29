/**
 * ElevenLabs workspace usage analytics adapter.
 *
 * Uses POST https://api.elevenlabs.io/v1/workspace/analytics/query/usage-by-product-over-time
 * Docs: https://elevenlabs.io/docs/api-reference/analytics/workspace/usage
 *
 * The response is tabular (columns / column_types / column_units / rows). A column whose unit
 * is "usd" is used as the provider-reported spend. When the workspace only reports credits
 * (subscription plans), USD = credits × ELEVENLABS_USD_PER_CREDIT; without that rate the sync
 * fails loudly instead of inventing a price.
 *
 * Credential: ELEVENLABS_API_KEY (key needs workspace analytics access).
 */

import type { ProviderBillingLineItem } from "./billing-reconciliation-service";
import {
  envPositiveNumber,
  fetchBillingJson,
  normalizeIso,
  splitWindow,
  toPlainDecimal,
  type BillingFetchOptions,
} from "./billing-adapter-http";

export interface ElevenLabsBillingAdapterOptions extends BillingFetchOptions {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly usdPerCredit?: number;
}

const MAX_WINDOW_DAYS = 31;
const DAY_SECONDS = 86_400;

export class ElevenLabsBillingAdapter {
  readonly providerId = "provider.elevenlabs";

  constructor(private readonly options: ElevenLabsBillingAdapterOptions = {}) {}

  isConfigured(): boolean {
    return Boolean(this.resolveApiKey());
  }

  async fetchAllCosts(input: {
    readonly startTimeSec: number;
    readonly endTimeSec: number;
  }): Promise<readonly ProviderBillingLineItem[]> {
    const apiKey = this.resolveApiKey();
    if (!apiKey) {
      throw new Error("ELEVENLABS_API_KEY is not configured");
    }

    const baseUrl = (this.options.baseUrl ?? "https://api.elevenlabs.io/v1").replace(/\/$/, "");
    const usdPerCredit =
      this.options.usdPerCredit ?? envPositiveNumber("ELEVENLABS_USD_PER_CREDIT", null);
    const all: ProviderBillingLineItem[] = [];

    for (const window of splitWindow(
      input.startTimeSec * 1000,
      input.endTimeSec * 1000,
      MAX_WINDOW_DAYS
    )) {
      const body = await fetchBillingJson(
        "ElevenLabs usage analytics",
        `${baseUrl}/workspace/analytics/query/usage-by-product-over-time`,
        {
          method: "POST",
          headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            start_time: window.startMs,
            end_time: window.endMs,
            interval_seconds: DAY_SECONDS,
            group_by: ["model"],
            time_zone: "UTC",
          }),
        },
        this.options
      );
      all.push(...parseUsageTable(body, usdPerCredit));
    }
    return all;
  }

  private resolveApiKey(): string | undefined {
    return (this.options.apiKey ?? process.env.ELEVENLABS_API_KEY)?.trim() || undefined;
  }
}

export function parseUsageTable(
  body: unknown,
  usdPerCredit: number | null
): ProviderBillingLineItem[] {
  const root = (body ?? {}) as Record<string, unknown>;
  const columns = asStrings(root.columns);
  const types = asStrings(root.column_types);
  const units = asStrings(root.column_units).map((u) => u.toLowerCase());
  const rows = Array.isArray(root.rows) ? root.rows : [];
  if (!rows.length) return [];

  const timeIdx = findIndex(columns, types, (name, type) => type === "DateTime" || /time|date/i.test(name));
  const modelIdx = columns.findIndex((name) => name === "model");
  const productIdx = columns.findIndex((name) => name === "product_type");
  const usdIdx = units.indexOf("usd");
  const creditsIdx = units.indexOf("credits");

  if (timeIdx < 0) {
    throw new Error("ElevenLabs usage response has no time column");
  }
  if (usdIdx < 0 && (creditsIdx < 0 || usdPerCredit == null)) {
    throw new Error(
      "ElevenLabs usage response reports credits only; set ELEVENLABS_USD_PER_CREDIT to convert"
    );
  }

  const lines: ProviderBillingLineItem[] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const startedAt = parseTimestamp(row[timeIdx]);
    if (!startedAt) continue;
    const usd =
      usdIdx >= 0 ? Number(row[usdIdx] ?? 0) : Number(row[creditsIdx] ?? 0) * (usdPerCredit ?? 0);
    if (!Number.isFinite(usd) || usd === 0) continue;
    const model = String(
      (modelIdx >= 0 ? row[modelIdx] : null) ?? (productIdx >= 0 ? row[productIdx] : null) ?? "unknown"
    );

    lines.push({
      providerUsageId: `elevenlabs:${startedAt}:${model}`,
      providerRequestId: null,
      amount: toPlainDecimal(usd),
      currency: "USD",
      modelId: model,
      completedAt: startedAt,
      bucketEnd: new Date(Date.parse(startedAt) + DAY_SECONDS * 1000).toISOString(),
    });
  }
  return lines;
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map((v) => String(v)) : [];
}

function findIndex(
  columns: string[],
  types: string[],
  match: (name: string, type: string) => boolean
): number {
  return columns.findIndex((name, i) => match(name, types[i] ?? ""));
}

/** Unix seconds / ms, or "2026-09-01 00:00:00" (UTC, no zone) → normalized ISO. */
function parseTimestamp(value: unknown): string | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return new Date(value < 1e12 ? value * 1000 : value).toISOString();
  }
  if (typeof value !== "string" || !value) return null;
  const hasZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value);
  return normalizeIso(hasZone ? value : `${value.replace(" ", "T")}Z`);
}
