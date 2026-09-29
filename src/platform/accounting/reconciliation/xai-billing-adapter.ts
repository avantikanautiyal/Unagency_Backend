/**
 * xAI Management API historical usage adapter.
 *
 * Uses POST https://management-api.x.ai/v1/billing/teams/{team_id}/usage
 * (management key required — NOT the inference XAI_API_KEY).
 * Docs: https://docs.x.ai/developers/rest-api-reference/management/billing
 *
 * Values are USD dollars (e.g. 0.75973725), daily-bucketed, grouped by line description
 * such as "Chat grok-4-0709".
 *
 * Credentials: XAI_MANAGEMENT_API_KEY + XAI_TEAM_ID (never expose to frontend).
 */

import type { ProviderBillingLineItem } from "./billing-reconciliation-service";
import {
  fetchBillingJson,
  normalizeIso,
  splitWindow,
  toPlainDecimal,
  type BillingFetchOptions,
} from "./billing-adapter-http";

export interface XaiBillingAdapterOptions extends BillingFetchOptions {
  readonly managementApiKey?: string;
  readonly teamId?: string;
  readonly baseUrl?: string;
}

/** Keep each query small enough that the analytics API never truncates (limitReached). */
const MAX_WINDOW_DAYS = 31;

export class XaiBillingAdapter {
  readonly providerId = "provider.xai";

  constructor(private readonly options: XaiBillingAdapterOptions = {}) {}

  isConfigured(): boolean {
    return Boolean(this.resolveApiKey() && this.resolveTeamId());
  }

  async fetchAllCosts(input: {
    readonly startTimeSec: number;
    readonly endTimeSec: number;
  }): Promise<readonly ProviderBillingLineItem[]> {
    const apiKey = this.resolveApiKey();
    const teamId = this.resolveTeamId();
    if (!apiKey || !teamId) {
      throw new Error("XAI_MANAGEMENT_API_KEY / XAI_TEAM_ID are not configured");
    }

    const baseUrl = (this.options.baseUrl ?? "https://management-api.x.ai").replace(/\/$/, "");
    const url = `${baseUrl}/v1/billing/teams/${encodeURIComponent(teamId)}/usage`;
    const all: ProviderBillingLineItem[] = [];

    for (const window of splitWindow(
      input.startTimeSec * 1000,
      input.endTimeSec * 1000,
      MAX_WINDOW_DAYS
    )) {
      const body = await fetchBillingJson(
        "xAI billing usage",
        url,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            analyticsRequest: {
              timeRange: {
                startTime: formatXaiTime(window.startMs),
                // endTime is inclusive on xAI; stop one second before the next window.
                endTime: formatXaiTime(window.endMs - 1000),
                timezone: "Etc/GMT",
              },
              timeUnit: "TIME_UNIT_DAY",
              values: [{ name: "usd", aggregation: "AGGREGATION_SUM" }],
              groupBy: ["description"],
              filters: [],
            },
          }),
        },
        this.options
      );
      all.push(...this.parseUsage(body));
    }
    return all;
  }

  private resolveApiKey(): string | undefined {
    return (this.options.managementApiKey ?? process.env.XAI_MANAGEMENT_API_KEY)?.trim() || undefined;
  }

  private resolveTeamId(): string | undefined {
    return (this.options.teamId ?? process.env.XAI_TEAM_ID)?.trim() || undefined;
  }

  private parseUsage(body: unknown): ProviderBillingLineItem[] {
    const root = (body ?? {}) as Record<string, unknown>;
    if (root.limitReached === true) {
      // A truncated series would silently under-report spend.
      throw new Error("xAI billing usage query hit limitReached; results are incomplete");
    }
    const series = Array.isArray(root.timeSeries) ? root.timeSeries : [];
    const lines: ProviderBillingLineItem[] = [];

    for (const entry of series) {
      if (!entry || typeof entry !== "object") continue;
      const s = entry as Record<string, unknown>;
      const group = Array.isArray(s.group) ? s.group.map(String) : [];
      const description = group.join(" / ") || "unknown";
      const points = Array.isArray(s.dataPoints) ? s.dataPoints : [];

      for (const point of points) {
        if (!point || typeof point !== "object") continue;
        const p = point as Record<string, unknown>;
        const startedAt = normalizeIso(p.timestamp);
        const values = Array.isArray(p.values) ? p.values : [];
        const usd = Number(values[0] ?? 0);
        if (!startedAt || !Number.isFinite(usd) || usd === 0) continue;

        lines.push({
          providerUsageId: `xai:${startedAt}:${description}`,
          providerRequestId: null,
          amount: toPlainDecimal(usd),
          currency: "USD",
          modelId: description,
          completedAt: startedAt,
          bucketEnd: new Date(Date.parse(startedAt) + 86_400_000).toISOString(),
        });
      }
    }
    return lines;
  }
}

/** 1788220800000 → "2026-09-01 00:00:00" (UTC). */
function formatXaiTime(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}
