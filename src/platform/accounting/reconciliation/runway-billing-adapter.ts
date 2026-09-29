/**
 * Runway organization credit usage adapter.
 *
 * Uses POST https://api.dev.runwayml.com/v1/organization/usage (normal API key).
 * Docs: https://docs.dev.runwayml.com/api/ ("Query credit usage")
 *
 * Runway reports net credits per model per UTC day (negative when refunds exceed charges).
 * API credits are bought at a fixed price, so USD = credits × RUNWAY_USD_PER_CREDIT
 * (default $0.01 — Runway's developer-portal credit price).
 *
 * Credential: RUNWAY_API_KEY.
 */

import type { ProviderBillingLineItem } from "./billing-reconciliation-service";
import {
  envPositiveNumber,
  fetchBillingJson,
  splitWindow,
  toPlainDecimal,
  utcDayBucket,
  type BillingFetchOptions,
} from "./billing-adapter-http";

export interface RunwayBillingAdapterOptions extends BillingFetchOptions {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly usdPerCredit?: number;
}

/** Runway rejects ranges where beforeDate is more than 90 days after startDate. */
const MAX_WINDOW_DAYS = 90;
const DEFAULT_USD_PER_CREDIT = 0.01;

export class RunwayBillingAdapter {
  readonly providerId = "provider.runway";

  constructor(private readonly options: RunwayBillingAdapterOptions = {}) {}

  isConfigured(): boolean {
    return Boolean(this.resolveApiKey());
  }

  async fetchAllCosts(input: {
    readonly startTimeSec: number;
    readonly endTimeSec: number;
  }): Promise<readonly ProviderBillingLineItem[]> {
    const apiKey = this.resolveApiKey();
    if (!apiKey) {
      throw new Error("RUNWAY_API_KEY is not configured");
    }

    const baseUrl = (this.options.baseUrl ?? "https://api.dev.runwayml.com/v1").replace(/\/$/, "");
    const usdPerCredit =
      this.options.usdPerCredit ??
      envPositiveNumber("RUNWAY_USD_PER_CREDIT", DEFAULT_USD_PER_CREDIT) ??
      DEFAULT_USD_PER_CREDIT;

    // Runway buckets are whole UTC days: widen to day boundaries (end day included).
    const startDay = floorUtcDay(input.startTimeSec * 1000);
    const endDayExclusive = floorUtcDay(input.endTimeSec * 1000 - 1) + 86_400_000;
    const all: ProviderBillingLineItem[] = [];

    for (const window of splitWindow(startDay, endDayExclusive, MAX_WINDOW_DAYS)) {
      const body = await fetchBillingJson(
        "Runway organization usage",
        `${baseUrl}/organization/usage`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "X-Runway-Version": "2024-11-06",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            startDate: isoDay(window.startMs),
            beforeDate: isoDay(window.endMs),
          }),
        },
        this.options
      );
      all.push(...parseUsage(body, usdPerCredit));
    }
    return all;
  }

  private resolveApiKey(): string | undefined {
    return (this.options.apiKey ?? process.env.RUNWAY_API_KEY)?.trim() || undefined;
  }
}

function parseUsage(body: unknown, usdPerCredit: number): ProviderBillingLineItem[] {
  const root = (body ?? {}) as Record<string, unknown>;
  const results = Array.isArray(root.results) ? root.results : [];
  const lines: ProviderBillingLineItem[] = [];

  for (const result of results) {
    if (!result || typeof result !== "object") continue;
    const r = result as Record<string, unknown>;
    const bucket = typeof r.date === "string" ? utcDayBucket(r.date) : null;
    if (!bucket) continue;
    const used = Array.isArray(r.usedCredits) ? r.usedCredits : [];

    for (const entry of used) {
      if (!entry || typeof entry !== "object") continue;
      const u = entry as Record<string, unknown>;
      const credits = Number(u.amount ?? 0);
      if (!Number.isFinite(credits) || credits === 0) continue;
      const model = String(u.model ?? "unknown");

      lines.push({
        providerUsageId: `runway:${bucket.start}:${model}`,
        providerRequestId: null,
        amount: toPlainDecimal(credits * usdPerCredit),
        currency: "USD",
        modelId: model,
        completedAt: bucket.start,
        bucketEnd: bucket.end,
      });
    }
  }
  return lines;
}

function floorUtcDay(ms: number): number {
  return ms - (((ms % 86_400_000) + 86_400_000) % 86_400_000);
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
