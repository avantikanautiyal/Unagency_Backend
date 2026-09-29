/**
 * Anthropic organization Cost Report adapter.
 *
 * Uses GET /v1/organizations/cost_report (Admin API key required).
 * Docs: https://platform.claude.com/docs/en/manage-claude/usage-cost-api
 *
 * Amounts are USD in lowest currency units (cents) as decimal strings —
 * e.g. "123.45" means $1.2345. Data is daily-bucketed and may lag.
 *
 * Credential: ANTHROPIC_ADMIN_API_KEY (never expose to frontend).
 */

import type { ProviderBillingLineItem } from "./billing-reconciliation-service";

export interface AnthropicCostsPage {
  readonly lines: readonly ProviderBillingLineItem[];
  readonly nextPage: string | null;
  readonly hasMore: boolean;
}

export interface AnthropicBillingAdapterOptions {
  readonly adminApiKey?: string;
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
  readonly maxRetries?: number;
}

export class AnthropicBillingAdapter {
  readonly providerId = "provider.anthropic";

  constructor(private readonly options: AnthropicBillingAdapterOptions = {}) {}

  isConfigured(): boolean {
    return Boolean(this.resolveApiKey());
  }

  /**
   * Fetch one page of organization cost report.
   * startingAt / endingAt are RFC 3339 timestamps; endingAt is exclusive.
   */
  async fetchCostsPage(input: {
    readonly startingAt: string;
    readonly endingAt: string;
    readonly page?: string | null;
    readonly limit?: number;
  }): Promise<AnthropicCostsPage> {
    const apiKey = this.resolveApiKey();
    if (!apiKey) {
      throw new Error("ANTHROPIC_ADMIN_API_KEY is not configured");
    }

    const baseUrl = (this.options.baseUrl ?? "https://api.anthropic.com/v1").replace(/\/$/, "");
    const params = new URLSearchParams();
    params.set("starting_at", input.startingAt);
    params.set("ending_at", input.endingAt);
    params.set("bucket_width", "1d");
    params.set("limit", String(input.limit ?? 31));
    params.append("group_by[]", "workspace_id");
    params.append("group_by[]", "description");
    if (input.page) params.set("page", input.page);

    const url = `${baseUrl}/organizations/cost_report?${params.toString()}`;
    const body = await this.fetchWithRetry(url, apiKey);
    return this.parseCostsPage(body);
  }

  async fetchAllCosts(input: {
    readonly startingAt: string;
    readonly endingAt: string;
  }): Promise<readonly ProviderBillingLineItem[]> {
    const all: ProviderBillingLineItem[] = [];
    let page: string | null = null;
    let guard = 0;
    do {
      const result = await this.fetchCostsPage({
        startingAt: input.startingAt,
        endingAt: input.endingAt,
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
      process.env.ANTHROPIC_ADMIN_API_KEY ??
      process.env.ANTHROPIC_ADMIN_KEY
    )?.trim();
  }

  /**
   * Optional ANTHROPIC_BILLING_WORKSPACE_IDS (comma-separated; "default" = default workspace)
   * scopes costs to this app's workspaces when the Anthropic org is shared.
   */
  private resolveWorkspaceIds(): Set<string> {
    return new Set(
      (process.env.ANTHROPIC_BILLING_WORKSPACE_IDS ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    );
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
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
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
          throw new Error(`Anthropic cost_report HTTP ${response.status}: ${text.slice(0, 500)}`);
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

  private parseCostsPage(body: unknown): AnthropicCostsPage {
    const root = body as Record<string, unknown>;
    const data = Array.isArray(root.data) ? root.data : [];
    const lines: ProviderBillingLineItem[] = [];
    const workspaceFilter = this.resolveWorkspaceIds();

    for (const bucket of data) {
      if (!bucket || typeof bucket !== "object") continue;
      const bucketObj = bucket as Record<string, unknown>;
      const startingAt = normalizeIso(bucketObj.starting_at ?? bucketObj.startingAt);
      const endingAt = normalizeIso(bucketObj.ending_at ?? bucketObj.endingAt);
      const results = Array.isArray(bucketObj.results) ? bucketObj.results : [];

      for (const row of results) {
        if (!row || typeof row !== "object") continue;
        const r = row as Record<string, unknown>;
        const workspaceId = r.workspace_id != null ? String(r.workspace_id) : "default";
        if (workspaceFilter.size && !workspaceFilter.has(workspaceId)) continue;
        // Anthropic reports amount in cents (lowest units) as a decimal string.
        const amountCents = Number(r.amount ?? 0);
        const currency = String(r.currency ?? "USD").toUpperCase();
        const usd =
          currency === "USD" && Number.isFinite(amountCents)
            ? toPlainDecimal(amountCents / 100)
            : String(r.amount ?? "0");
        const modelId = String(r.model ?? r.description ?? r.cost_type ?? "unknown");
        // One model yields several lines per bucket (input/output/cache tokens, tiers),
        // so the key must include every grouping dimension or lines collapse.
        const lineKey = [
          r.description,
          r.cost_type,
          r.token_type,
          r.context_window,
          r.service_tier,
          r.inference_geo,
        ]
          .map((part) => String(part ?? ""))
          .join("|");
        const providerUsageId = `anthropic:${startingAt ?? ""}:${workspaceId}:${modelId}:${lineKey}`;

        lines.push({
          providerUsageId,
          providerRequestId: null,
          amount: usd,
          currency: "USD",
          modelId,
          completedAt: startingAt,
          bucketEnd: endingAt,
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
      hasMore: Boolean(nextPage ?? root.has_more),
    };
  }
}

/** "2025-08-01T00:00:00Z" → "2025-08-01T00:00:00.000Z" so ISO strings compare correctly in Mongo. */
function normalizeIso(value: unknown): string | null {
  if (value == null || value === "") return null;
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** Plain decimal string (no exponent, no trailing zeros) that parseUsdToMicro accepts. */
function toPlainDecimal(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(8).replace(/\.?0+$/, "") || "0";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
