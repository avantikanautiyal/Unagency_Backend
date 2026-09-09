/**
 * OpenAI organization billing adapter.
 *
 * Uses GET /v1/organization/costs (Admin API key required).
 * Data is daily-bucketed and may lag — NOT real-time.
 *
 * Credential: OPENAI_ADMIN_API_KEY (never expose to frontend).
 */

import type { ProviderBillingLineItem } from "./billing-reconciliation-service";

export interface OpenAICostsPage {
  readonly lines: readonly ProviderBillingLineItem[];
  readonly nextPage: string | null;
  readonly hasMore: boolean;
}

export interface OpenAIBillingAdapterOptions {
  readonly adminApiKey?: string;
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
  readonly maxRetries?: number;
}

export class OpenAIBillingAdapter {
  readonly providerId = "provider.openai";

  constructor(private readonly options: OpenAIBillingAdapterOptions = {}) {}

  isConfigured(): boolean {
    return Boolean(this.resolveApiKey());
  }

  /**
   * Fetch one page of organization costs.
   * startTime/endTime are Unix seconds (UTC). endTime is exclusive per OpenAI API.
   */
  async fetchCostsPage(input: {
    readonly startTimeSec: number;
    readonly endTimeSec: number;
    readonly page?: string | null;
    readonly limit?: number;
  }): Promise<OpenAICostsPage> {
    const apiKey = this.resolveApiKey();
    if (!apiKey) {
      throw new Error("OPENAI_ADMIN_API_KEY is not configured");
    }

    const baseUrl = (this.options.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
    const params = new URLSearchParams();
    params.set("start_time", String(input.startTimeSec));
    params.set("end_time", String(input.endTimeSec));
    params.set("bucket_width", "1d");
    params.set("limit", String(input.limit ?? 31));
    params.set("group_by", "line_item");
    if (input.page) params.set("page", input.page);

    const url = `${baseUrl}/organization/costs?${params.toString()}`;
    const body = await this.fetchWithRetry(url, apiKey);
    return this.parseCostsPage(body);
  }

  /** Paginate through all cost buckets in range. */
  async fetchAllCosts(input: {
    readonly startTimeSec: number;
    readonly endTimeSec: number;
  }): Promise<readonly ProviderBillingLineItem[]> {
    const all: ProviderBillingLineItem[] = [];
    let page: string | null = null;
    let guard = 0;
    do {
      const result = await this.fetchCostsPage({
        startTimeSec: input.startTimeSec,
        endTimeSec: input.endTimeSec,
        page,
      });
      all.push(...result.lines);
      page = result.nextPage;
      guard += 1;
      if (guard > 100) break;
    } while (page);
    return all;
  }

  private resolveApiKey(): string | undefined {
    return (
      this.options.adminApiKey ??
      process.env.OPENAI_ADMIN_API_KEY ??
      process.env.OPENAI_ADMIN_KEY
    )?.trim();
  }

  private async fetchWithRetry(url: string, apiKey: string): Promise<unknown> {
    const fetchFn = this.options.fetchImpl ?? fetch;
    const maxRetries = this.options.maxRetries ?? 3;
    let lastError: unknown;

    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      try {
        const response = await fetchFn(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        });

        if (response.status === 429) {
          const retryAfter = Number(response.headers.get("retry-after") ?? "2");
          await sleep(Math.min(retryAfter, 30) * 1000);
          continue;
        }

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`OpenAI costs API HTTP ${response.status}: ${text.slice(0, 500)}`);
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

  private parseCostsPage(body: unknown): OpenAICostsPage {
    const root = body as Record<string, unknown>;
    const data = Array.isArray(root.data) ? root.data : [];
    const lines: ProviderBillingLineItem[] = [];

    for (const bucket of data) {
      if (!bucket || typeof bucket !== "object") continue;
      const bucketObj = bucket as Record<string, unknown>;
      const bucketStart = bucketObj.start_time ?? bucketObj.startTime;
      const results = Array.isArray(bucketObj.results) ? bucketObj.results : [];

      for (const row of results) {
        if (!row || typeof row !== "object") continue;
        const r = row as Record<string, unknown>;
        const amountObj = r.amount as Record<string, unknown> | undefined;
        const value = amountObj?.value ?? r.amount;
        const currency = String(amountObj?.currency ?? "usd").toUpperCase();
        const lineItem = String(r.line_item ?? r.lineItem ?? "unknown");
        const providerUsageId = `openai:${String(bucketStart ?? "")}:${lineItem}`;

        lines.push({
          providerUsageId,
          providerRequestId: null,
          amount: value != null ? String(value) : "0",
          currency,
          modelId: lineItem,
          completedAt:
            typeof bucketStart === "number"
              ? new Date(bucketStart * 1000).toISOString()
              : null,
        });
      }
    }

    const nextPage =
      typeof root.next_page === "string"
        ? root.next_page
        : typeof root.nextPage === "string"
          ? root.nextPage
          : null;

    return {
      lines,
      nextPage,
      hasMore: Boolean(nextPage),
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
