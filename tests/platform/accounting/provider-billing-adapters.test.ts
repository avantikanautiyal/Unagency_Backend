/**
 * xAI / Runway / ElevenLabs / Gemini (BigQuery export) billing adapters — wire + parsing.
 */

import { XaiBillingAdapter } from "../../../src/platform/accounting/reconciliation/xai-billing-adapter";
import { RunwayBillingAdapter } from "../../../src/platform/accounting/reconciliation/runway-billing-adapter";
import {
  ElevenLabsBillingAdapter,
  parseUsageTable,
} from "../../../src/platform/accounting/reconciliation/elevenlabs-billing-adapter";
import {
  GeminiBillingAdapter,
  attributeGeminiSku,
} from "../../../src/platform/accounting/reconciliation/gemini-billing-adapter";

type Call = { url: string; init?: RequestInit };

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function recordingFetch(respond: (call: Call, index: number) => unknown) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const call = { url, init };
    calls.push(call);
    return jsonResponse(respond(call, calls.length - 1));
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const SEP_1 = Date.parse("2026-09-01T00:00:00.000Z") / 1000;

describe("XaiBillingAdapter", () => {
  it("posts a daily USD usage query per ≤31-day window and parses dollar values", async () => {
    const { calls, fetchImpl } = recordingFetch(() => ({
      timeSeries: [
        {
          group: ["Chat grok-4-0709"],
          dataPoints: [
            { timestamp: "2026-09-01T00:00:00Z", values: [0.75973725] },
            { timestamp: "2026-09-02T00:00:00Z", values: [0] },
          ],
        },
      ],
      limitReached: false,
    }));
    const adapter = new XaiBillingAdapter({ managementApiKey: "xai-mgmt", teamId: "team_1", fetchImpl });

    const lines = await adapter.fetchAllCosts({ startTimeSec: SEP_1, endTimeSec: SEP_1 + 40 * 86_400 });

    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("https://management-api.x.ai/v1/billing/teams/team_1/usage");
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.analyticsRequest.timeRange).toEqual({
      startTime: "2026-09-01 00:00:00",
      endTime: "2026-10-01 23:59:59",
      timezone: "Etc/GMT",
    });
    expect(body.analyticsRequest.groupBy).toEqual(["description"]);
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe("Bearer xai-mgmt");
    // Same payload for both windows → one non-zero line each.
    expect(lines.map((l) => l.amount)).toEqual(["0.75973725", "0.75973725"]);
    expect(lines[0]).toMatchObject({
      modelId: "Chat grok-4-0709",
      completedAt: "2026-09-01T00:00:00.000Z",
      bucketEnd: "2026-09-02T00:00:00.000Z",
    });
  });

  it("refuses truncated results", async () => {
    const { fetchImpl } = recordingFetch(() => ({ timeSeries: [], limitReached: true }));
    const adapter = new XaiBillingAdapter({ managementApiKey: "k", teamId: "t", fetchImpl, maxRetries: 1 });
    await expect(adapter.fetchAllCosts({ startTimeSec: SEP_1, endTimeSec: SEP_1 + 86_400 })).rejects.toThrow(
      /limitReached/
    );
  });

  it("needs both management key and team id", () => {
    expect(new XaiBillingAdapter({ managementApiKey: "k" }).isConfigured()).toBe(false);
    expect(new XaiBillingAdapter({ managementApiKey: "k", teamId: "t" }).isConfigured()).toBe(true);
  });
});

describe("RunwayBillingAdapter", () => {
  it("queries whole UTC days in ≤90-day windows and converts net credits to USD", async () => {
    const { calls, fetchImpl } = recordingFetch(() => ({
      models: ["gen4_turbo"],
      results: [
        {
          date: "2026-09-01",
          usedCredits: [
            { model: "gen4_turbo", amount: 125 },
            { model: "gen4.5", amount: -12 },
          ],
        },
      ],
    }));
    const adapter = new RunwayBillingAdapter({ apiKey: "rw", fetchImpl });

    // Mid-day start and end: must widen to 2026-09-01 .. 2026-12-15 (exclusive 12-16).
    const lines = await adapter.fetchAllCosts({
      startTimeSec: SEP_1 + 3600,
      endTimeSec: Date.parse("2026-12-15T10:00:00.000Z") / 1000,
    });

    expect(calls.map((c) => JSON.parse(String(c.init?.body)))).toEqual([
      { startDate: "2026-09-01", beforeDate: "2026-11-30" },
      { startDate: "2026-11-30", beforeDate: "2026-12-16" },
    ]);
    expect((calls[0].init?.headers as Record<string, string>)["X-Runway-Version"]).toBe("2024-11-06");
    expect(lines.slice(0, 2).map((l) => [l.modelId, l.amount])).toEqual([
      ["gen4_turbo", "1.25"],
      ["gen4.5", "-0.12"],
    ]);
    expect(lines[0].completedAt).toBe("2026-09-01T00:00:00.000Z");
  });

  it("honours a custom credit price", async () => {
    const { fetchImpl } = recordingFetch(() => ({
      results: [{ date: "2026-09-01", usedCredits: [{ model: "gen4_turbo", amount: 100 }] }],
    }));
    const adapter = new RunwayBillingAdapter({ apiKey: "rw", fetchImpl, usdPerCredit: 0.008 });
    const lines = await adapter.fetchAllCosts({ startTimeSec: SEP_1, endTimeSec: SEP_1 + 86_400 });
    expect(lines[0].amount).toBe("0.8");
  });
});

describe("ElevenLabsBillingAdapter", () => {
  it("uses the usd-unit column when the workspace reports fiat spend", async () => {
    const { calls, fetchImpl } = recordingFetch(() => ({
      columns: ["timestamp", "model", "credits_used", "fiat_spent"],
      column_types: ["DateTime", "String", "Float", "Float"],
      column_units: [null, null, "credits", "usd"],
      rows: [
        ["2026-09-01 00:00:00", "eleven_v3", 5000, 1.5],
        ["2026-09-02 00:00:00", "eleven_v3", 0, 0],
      ],
    }));
    const adapter = new ElevenLabsBillingAdapter({ apiKey: "el", fetchImpl });

    const lines = await adapter.fetchAllCosts({ startTimeSec: SEP_1, endTimeSec: SEP_1 + 2 * 86_400 });

    const body = JSON.parse(String(calls[0].init?.body));
    expect(body).toMatchObject({ interval_seconds: 86_400, group_by: ["model"], start_time: SEP_1 * 1000 });
    expect((calls[0].init?.headers as Record<string, string>)["xi-api-key"]).toBe("el");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ amount: "1.5", modelId: "eleven_v3", completedAt: "2026-09-01T00:00:00.000Z" });
  });

  it("converts credits only with an explicit per-credit rate, otherwise fails loudly", () => {
    const creditsOnly = {
      columns: ["timestamp", "model", "credits_used"],
      column_types: ["DateTime", "String", "Float"],
      column_units: [null, null, "credits"],
      rows: [[SEP_1 * 1000, "eleven_v3", 10_000]],
    };
    expect(() => parseUsageTable(creditsOnly, null)).toThrow(/ELEVENLABS_USD_PER_CREDIT/);
    const lines = parseUsageTable(creditsOnly, 0.00003);
    expect(lines[0]).toMatchObject({ amount: "0.3", completedAt: "2026-09-01T00:00:00.000Z" });
  });
});

describe("GeminiBillingAdapter (BigQuery billing export)", () => {
  const prevServices = process.env.GCP_BILLING_SERVICES;
  const prevProjects = process.env.GCP_BILLING_PROJECT_IDS;
  afterEach(() => {
    if (prevServices === undefined) delete process.env.GCP_BILLING_SERVICES;
    else process.env.GCP_BILLING_SERVICES = prevServices;
    if (prevProjects === undefined) delete process.env.GCP_BILLING_PROJECT_IDS;
    else process.env.GCP_BILLING_PROJECT_IDS = prevProjects;
  });

  it("runs a parameterised query, follows paging, and splits text vs media SKUs", async () => {
    delete process.env.GCP_BILLING_SERVICES;
    process.env.GCP_BILLING_PROJECT_IDS = "unagency-prod";
    const { calls, fetchImpl } = recordingFetch((_call, index) =>
      index === 0
        ? {
            jobComplete: true,
            jobReference: { projectId: "billing-proj", jobId: "job_1", location: "US" },
            pageToken: "p2",
            rows: [
              { f: [{ v: "2026-09-01" }, { v: "Generate content input token count Gemini 2.5 Flash" }, { v: "0.42" }] },
            ],
          }
        : {
            jobComplete: true,
            rows: [
              { f: [{ v: "2026-09-01" }, { v: "Gemini 3.1 Flash Image output image count" }, { v: "1.2" }] },
              { f: [{ v: "2026-09-02" }, { v: "Veo 3.1 video generation" }, { v: "3" }] },
              { f: [{ v: "2026-09-02" }, { v: "Free tier credit" }, { v: "0" }] },
            ],
          }
    );
    const adapter = new GeminiBillingAdapter({
      exportTable: "billing-proj.billing_ds.gcp_billing_export_v1_ABC",
      getAccessToken: async () => "ya29.test",
      fetchImpl,
    });

    const byProvider = await adapter.fetchAllCostsByProvider({ startTimeSec: SEP_1, endTimeSec: SEP_1 + 2 * 86_400 });

    expect(calls[0].url).toBe("https://bigquery.googleapis.com/bigquery/v2/projects/billing-proj/queries");
    const request = JSON.parse(String(calls[0].init?.body));
    expect(request.query).toContain("FROM `billing-proj.billing_ds.gcp_billing_export_v1_ABC`");
    expect(request.query).toContain("project.id IN UNNEST(@projects)");
    expect(request.queryParameters.map((p: { name: string }) => p.name)).toEqual([
      "start",
      "end",
      "services",
      "projects",
    ]);
    expect(calls[1].url).toContain("/queries/job_1?");
    expect(calls[1].url).toContain("pageToken=p2");
    expect(calls[1].url).toContain("location=US");

    expect(byProvider.get("provider.gemini")!.map((l) => l.amount)).toEqual(["0.42"]);
    expect(byProvider.get("provider.google")!.map((l) => [l.amount, l.completedAt])).toEqual([
      ["1.2", "2026-09-01T00:00:00.000Z"],
      ["3", "2026-09-02T00:00:00.000Z"],
    ]);
  });

  it("rejects table names that could inject SQL", async () => {
    const adapter = new GeminiBillingAdapter({
      exportTable: "proj.ds.tbl` WHERE 1=1 --",
      getAccessToken: async () => "t",
    });
    await expect(adapter.fetchAllCostsByProvider({ startTimeSec: SEP_1, endTimeSec: SEP_1 + 1 })).rejects.toThrow(
      /project\.dataset\.table/
    );
  });

  it("attributes SKUs to the right canonical provider", () => {
    expect(attributeGeminiSku("Generate content output token count Gemini 2.5 Pro")).toBe("provider.gemini");
    expect(attributeGeminiSku("Imagen 4 image generation")).toBe("provider.google");
    expect(attributeGeminiSku("Gemini 2.5 Flash-Image output")).toBe("provider.google");
  });
});
