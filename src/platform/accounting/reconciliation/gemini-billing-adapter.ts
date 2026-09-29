/**
 * Gemini API cost adapter — Cloud Billing export to BigQuery.
 *
 * Google has no cost endpoint for the Gemini API; actual charges live in the Cloud Billing
 * export table (Billing → Billing export → BigQuery export → "Standard usage cost").
 * Docs: https://cloud.google.com/billing/docs/how-to/export-data-bigquery
 *
 * Cost per UTC day per SKU = (cost + credits) / currency_conversion_rate → USD, so free-tier
 * and promotional credits are netted out and non-USD billing accounts are converted.
 * Export data lags by several hours (up to ~1 day).
 *
 * Both canonical Google providers bill through generativelanguage.googleapis.com, so SKUs are
 * attributed by description: image/video generation SKUs → provider.google (Gemini image, Veo),
 * everything else → provider.gemini (text).
 *
 * Config:
 *   GCP_BILLING_EXPORT_TABLE   project.dataset.gcp_billing_export_v1_XXXXXX_XXXXXX_XXXXXX
 *   GCP_BILLING_SERVICE_ACCOUNT_JSON  service-account key JSON (or GOOGLE_APPLICATION_CREDENTIALS)
 *   GCP_BILLING_QUERY_PROJECT  project that runs the query job (default: the table's project)
 *   GCP_BILLING_PROJECT_IDS    optional comma list — only these GCP projects' usage
 *   GCP_BILLING_SERVICES       optional comma list of service.description values
 */

import type { ProviderBillingLineItem } from "./billing-reconciliation-service";
import {
  envList,
  fetchBillingJson,
  toPlainDecimal,
  utcDayBucket,
  type BillingFetchOptions,
} from "./billing-adapter-http";

export const GEMINI_TEXT_PROVIDER_ID = "provider.gemini";
export const GOOGLE_MEDIA_PROVIDER_ID = "provider.google";

const DEFAULT_SERVICES = ["Gemini API", "Generative Language API"];
const MEDIA_SKU_PATTERN =
  /\b(imagen|veo|nano banana)\b|flash[ -]?image|image generation|video generation|output image|generated image|generated video/i;
const TABLE_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_]+\.[A-Za-z0-9_$]+$/;
const BIGQUERY_SCOPE = "https://www.googleapis.com/auth/bigquery.readonly";

export interface GeminiBillingAdapterOptions extends BillingFetchOptions {
  readonly exportTable?: string;
  readonly queryProject?: string;
  /** Injected in tests; defaults to a GoogleAuth service-account token. */
  readonly getAccessToken?: () => Promise<string>;
}

export class GeminiBillingAdapter {
  readonly providerIds = [GEMINI_TEXT_PROVIDER_ID, GOOGLE_MEDIA_PROVIDER_ID] as const;

  constructor(private readonly options: GeminiBillingAdapterOptions = {}) {}

  isConfigured(): boolean {
    const table = this.resolveTable();
    return Boolean(
      table &&
        (this.options.getAccessToken ||
          process.env.GCP_BILLING_SERVICE_ACCOUNT_JSON?.trim() ||
          process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim())
    );
  }

  /** Billing lines keyed by canonical provider id (both keys always present). */
  async fetchAllCostsByProvider(input: {
    readonly startTimeSec: number;
    readonly endTimeSec: number;
  }): Promise<Map<string, ProviderBillingLineItem[]>> {
    const table = this.resolveTable();
    if (!table) {
      throw new Error("GCP_BILLING_EXPORT_TABLE is not configured");
    }
    if (!TABLE_PATTERN.test(table)) {
      throw new Error("GCP_BILLING_EXPORT_TABLE must look like project.dataset.table");
    }

    const queryProject =
      this.options.queryProject || process.env.GCP_BILLING_QUERY_PROJECT?.trim() || table.split(".")[0];
    const services = envList("GCP_BILLING_SERVICES");
    const projectIds = envList("GCP_BILLING_PROJECT_IDS");
    const token = await this.accessToken();

    const query = [
      "SELECT",
      "  FORMAT_TIMESTAMP('%Y-%m-%d', usage_start_time, 'UTC') AS day,",
      "  sku.description AS sku,",
      "  SUM((cost + IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0))",
      "      / IFNULL(NULLIF(currency_conversion_rate, 0), 1)) AS usd",
      `FROM \`${table}\``,
      "WHERE usage_start_time >= @start AND usage_start_time < @end",
      "  AND service.description IN UNNEST(@services)",
      projectIds.length ? "  AND project.id IN UNNEST(@projects)" : "",
      "GROUP BY day, sku",
    ]
      .filter(Boolean)
      .join("\n");

    const queryParameters: unknown[] = [
      timestampParam("start", input.startTimeSec),
      timestampParam("end", input.endTimeSec),
      stringArrayParam("services", services.length ? services : DEFAULT_SERVICES),
    ];
    if (projectIds.length) queryParameters.push(stringArrayParam("projects", projectIds));

    const rows = await this.runQuery(queryProject, token, {
      query,
      useLegacySql: false,
      parameterMode: "NAMED",
      queryParameters,
      timeoutMs: 60_000,
    });

    const byProvider = new Map<string, ProviderBillingLineItem[]>([
      [GEMINI_TEXT_PROVIDER_ID, []],
      [GOOGLE_MEDIA_PROVIDER_ID, []],
    ]);
    for (const row of rows) {
      const [day, sku, usdRaw] = row;
      const bucket = day ? utcDayBucket(day) : null;
      const usd = Number(usdRaw ?? 0);
      if (!bucket || !Number.isFinite(usd) || usd === 0) continue;
      const skuName = sku ?? "unknown";
      const providerId = attributeGeminiSku(skuName);
      byProvider.get(providerId)!.push({
        providerUsageId: `gcp:${bucket.start}:${skuName}`,
        providerRequestId: null,
        amount: toPlainDecimal(usd),
        currency: "USD",
        modelId: skuName,
        completedAt: bucket.start,
        bucketEnd: bucket.end,
      });
    }
    return byProvider;
  }

  private resolveTable(): string | undefined {
    return (this.options.exportTable ?? process.env.GCP_BILLING_EXPORT_TABLE)?.trim() || undefined;
  }

  private async accessToken(): Promise<string> {
    if (this.options.getAccessToken) return this.options.getAccessToken();
    // Lazy: googleapis is large and only needed when Gemini billing sync is configured.
    const { google } = await import("googleapis");
    const inline = process.env.GCP_BILLING_SERVICE_ACCOUNT_JSON?.trim();
    const auth = new google.auth.GoogleAuth({
      scopes: [BIGQUERY_SCOPE],
      ...(inline ? { credentials: JSON.parse(inline) } : {}),
    });
    const token = await auth.getAccessToken();
    if (!token) throw new Error("Could not obtain a Google access token for BigQuery");
    return token;
  }

  /** jobs.query, then getQueryResults until the job completes and all pages are read. */
  private async runQuery(
    queryProject: string,
    token: string,
    request: Record<string, unknown>
  ): Promise<Array<Array<string | null>>> {
    const base = `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(queryProject)}`;
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    let page = (await fetchBillingJson(
      "BigQuery billing export query",
      `${base}/queries`,
      { method: "POST", headers, body: JSON.stringify(request) },
      this.options
    )) as BigQueryResultPage;

    const rows: Array<Array<string | null>> = [];
    for (let guard = 0; guard < 200; guard += 1) {
      if (page.jobComplete !== false) {
        for (const row of page.rows ?? []) {
          rows.push((row.f ?? []).map((cell) => (cell?.v == null ? null : String(cell.v))));
        }
        if (!page.pageToken) return rows;
      }
      const job = page.jobReference;
      if (!job?.jobId) {
        throw new Error("BigQuery query did not return a job reference");
      }
      const params = new URLSearchParams({ timeoutMs: "60000" });
      if (job.location) params.set("location", job.location);
      if (page.jobComplete !== false && page.pageToken) params.set("pageToken", page.pageToken);
      page = (await fetchBillingJson(
        "BigQuery billing export results",
        `${base}/queries/${encodeURIComponent(job.jobId)}?${params.toString()}`,
        { method: "GET", headers },
        this.options
      )) as BigQueryResultPage;
      page.jobReference ??= job;
    }
    throw new Error("BigQuery billing export query did not finish");
  }
}

export function attributeGeminiSku(skuDescription: string): string {
  return MEDIA_SKU_PATTERN.test(skuDescription) ? GOOGLE_MEDIA_PROVIDER_ID : GEMINI_TEXT_PROVIDER_ID;
}

interface BigQueryResultPage {
  jobComplete?: boolean;
  rows?: Array<{ f?: Array<{ v?: unknown }> }>;
  pageToken?: string;
  jobReference?: { projectId?: string; jobId?: string; location?: string };
}

function timestampParam(name: string, epochSec: number) {
  return {
    name,
    parameterType: { type: "TIMESTAMP" },
    parameterValue: { value: new Date(epochSec * 1000).toISOString() },
  };
}

function stringArrayParam(name: string, values: string[]) {
  return {
    name,
    parameterType: { type: "ARRAY", arrayType: { type: "STRING" } },
    parameterValue: { arrayValues: values.map((value) => ({ value })) },
  };
}
