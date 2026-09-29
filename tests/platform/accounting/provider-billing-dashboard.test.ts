/**
 * Admin revenue dashboard — AI cost must come from provider cost reports when synced.
 */

import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { OpenAIBillingAdapter } from "../../../src/platform/accounting/reconciliation/openai-billing-adapter";
import { AnthropicBillingAdapter } from "../../../src/platform/accounting/reconciliation/anthropic-billing-adapter";
import { ProviderBillingSyncService } from "../../../src/platform/accounting/reconciliation/provider-billing-sync-service";
import { ProviderBillingLineModel } from "../../../src/platform/infrastructure/durability/mongo/models/ai-provider-billing-line.model";
import { AIUsageRecordModel } from "../../../src/platform/infrastructure/durability/mongo/models/ai-usage-record.model";
import {
  sumLedgerAiCostByMonth,
  sumLedgerAiCostUsd,
} from "../../../src/platform/api/services/admin-ai-cost-ledger";

const DAY_SEC = 86_400;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function openAiCostsBody(startSec: number, lines: Array<{ item: string; usd: number }>) {
  return {
    object: "page",
    data: [
      {
        object: "bucket",
        start_time: startSec,
        end_time: startSec + DAY_SEC,
        results: lines.map((line) => ({
          object: "organization.costs.result",
          amount: { value: line.usd, currency: "usd" },
          line_item: line.item,
          project_id: "proj_app",
        })),
      },
    ],
    has_more: false,
    next_page: null,
  };
}

function anthropicCostBody(startIso: string, lines: Array<{ tokenType: string; cents: string }>) {
  return {
    data: [
      {
        starting_at: startIso,
        ending_at: startIso.replace("T00:00:00Z", "T23:59:59Z"),
        results: lines.map((line) => ({
          currency: "USD",
          amount: line.cents,
          workspace_id: null,
          description: `Claude Sonnet 4.5 Usage - ${line.tokenType}`,
          cost_type: "tokens",
          model: "claude-sonnet-4-5",
          token_type: line.tokenType,
          context_window: "0-200k",
          service_tier: "standard",
        })),
      },
    ],
    has_more: false,
    next_page: null,
  };
}

function usageRecord(input: {
  id: string;
  providerId: string;
  completedAt: string;
  usd: string | null;
  succeeded?: boolean;
}) {
  const succeeded = input.succeeded ?? true;
  return {
    usageRecordId: input.id,
    idempotencyKey: input.id,
    providerId: input.providerId,
    providerAccount: null,
    modelId: `${input.providerId.replace("provider.", "")}/model`,
    internalRequestId: input.id,
    providerRequestId: null,
    executionId: `exec_${input.id}`,
    organizationId: "org_1",
    workspaceId: "ws_default",
    service: "text.generate",
    capabilityId: "text.generate",
    startedAt: input.completedAt,
    completedAt: input.completedAt,
    createdAt: input.completedAt,
    invocationStatus: succeeded ? "SUCCEEDED" : "FAILED",
    retryCount: 0,
    usage: { inputTokens: 10, outputTokens: 10, otherUnits: [] },
    cost: {
      estimatedTotalCostUsd: input.usd,
      reportingAmountUsd: input.usd,
      reportingCurrency: "USD",
      originalCurrency: "USD",
      costStatus: succeeded ? "CALCULATED" : "PENDING_PROVIDER_USAGE",
      pricingVersion: "seed-v2",
      calculationVersion: "1.0.0",
      unitPricesApplied: [],
    },
    billingPeriod: input.completedAt.slice(0, 7),
  };
}

describe("OpenAI / Anthropic billing adapters", () => {
  it("OpenAI: groups by line item + project and keeps sub-micro amounts parseable", async () => {
    const urls: string[] = [];
    const adapter = new OpenAIBillingAdapter({
      adminApiKey: "sk-admin-test",
      fetchImpl: (async (url: string) => {
        urls.push(url);
        return jsonResponse(
          openAiCostsBody(1_788_220_800, [
            { item: "gpt-4o-mini, input", usd: 0.0000001 },
            { item: "gpt-4o-mini, output", usd: 1.25 },
          ])
        );
      }) as unknown as typeof fetch,
    });

    const lines = await adapter.fetchAllCosts({ startTimeSec: 1_788_220_800, endTimeSec: 1_788_307_200 });
    expect(urls[0]).toContain("group_by=line_item");
    expect(urls[0]).toContain("group_by=project_id");
    expect(lines).toHaveLength(2);
    expect(lines[0].amount).toBe("0.0000001");
    expect(lines[1].amount).toBe("1.25");
    expect(new Set(lines.map((l) => l.providerUsageId)).size).toBe(2);
    expect(lines[0].completedAt).toBe("2026-09-01T00:00:00.000Z");
  });

  it("Anthropic: cents → USD, one line per token type, normalized ISO bucket start", async () => {
    const adapter = new AnthropicBillingAdapter({
      adminApiKey: "sk-ant-admin-test",
      fetchImpl: (async () =>
        jsonResponse(
          anthropicCostBody("2026-09-01T00:00:00Z", [
            { tokenType: "uncached_input_tokens", cents: "123.45" },
            { tokenType: "output_tokens", cents: "250" },
          ])
        )) as unknown as typeof fetch,
    });

    const lines = await adapter.fetchAllCosts({
      startingAt: "2026-09-01T00:00:00Z",
      endingAt: "2026-09-02T00:00:00Z",
    });
    expect(lines.map((l) => l.amount)).toEqual(["1.2345", "2.5"]);
    expect(new Set(lines.map((l) => l.providerUsageId)).size).toBe(2);
    expect(lines[0].completedAt).toBe("2026-09-01T00:00:00.000Z");
  });
});

describe("admin AI cost — provider-reported vs estimated", () => {
  let mongod: MongoMemoryServer;
  const originalFetch = global.fetch;
  const prevOpenAiKey = process.env.OPENAI_ADMIN_API_KEY;
  const prevAnthropicKey = process.env.ANTHROPIC_ADMIN_API_KEY;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  }, 60_000);

  afterAll(async () => {
    global.fetch = originalFetch;
    if (prevOpenAiKey === undefined) delete process.env.OPENAI_ADMIN_API_KEY;
    else process.env.OPENAI_ADMIN_API_KEY = prevOpenAiKey;
    if (prevAnthropicKey === undefined) delete process.env.ANTHROPIC_ADMIN_API_KEY;
    else process.env.ANTHROPIC_ADMIN_API_KEY = prevAnthropicKey;
    await mongoose.disconnect();
    await mongod.stop();
  });

  it("re-sync overwrites revised buckets and dashboard totals prefer provider reports", async () => {
    process.env.OPENAI_ADMIN_API_KEY = "sk-admin-test";
    delete process.env.ANTHROPIC_ADMIN_API_KEY;

    // Sep 2026 in billing tz (IST) starts 2026-08-31T18:30Z.
    const rangeStart = new Date("2026-08-31T18:30:00.000Z");
    const rangeEnd = new Date("2026-09-20T00:00:00.000Z");
    const bucketSec = Date.parse("2026-09-05T00:00:00.000Z") / 1000;

    await AIUsageRecordModel.collection.insertMany([
      usageRecord({ id: "u1", providerId: "provider.openai", completedAt: "2026-09-05T10:00:00.000Z", usd: "1" }),
      usageRecord({ id: "u2", providerId: "provider.openai", completedAt: "2026-09-05T11:00:00.000Z", usd: null, succeeded: false }),
      usageRecord({ id: "u3", providerId: "provider.gemini", completedAt: "2026-09-06T11:00:00.000Z", usd: "0.4" }),
    ]);

    let reportedUsd = 2;
    global.fetch = (async () =>
      jsonResponse(openAiCostsBody(bucketSec, [{ item: "gpt-4o-mini, output", usd: reportedUsd }]))) as unknown as typeof fetch;

    const sync = new ProviderBillingSyncService();
    const syncWindow = {
      startTimeSec: Date.parse("2026-04-01T00:00:00.000Z") / 1000,
      endTimeSec: rangeEnd.getTime() / 1000,
    };
    await sync.syncConfiguredProviders(syncWindow);
    reportedUsd = 2.5; // provider revised the open day's bucket
    await sync.syncConfiguredProviders(syncWindow);

    expect(await ProviderBillingLineModel.countDocuments({ providerId: "provider.openai" })).toBe(1);

    const totals = await sumLedgerAiCostUsd({ start: rangeStart, end: rangeEnd });
    const openai = totals.byProvider.get("provider.openai");
    const gemini = totals.byProvider.get("provider.gemini");
    expect(openai).toMatchObject({ amount: 2.5, estimatedAmount: 1, source: "provider", count: 1 });
    expect(gemini).toMatchObject({ amount: 0.4, source: "estimated", count: 1 });
    expect(totals.aiCostUsd).toBeCloseTo(2.9, 6);
    expect(totals.providerReportedUsd).toBeCloseTo(2.5, 6);

    const byMonth = await sumLedgerAiCostByMonth({ start: rangeStart, end: rangeEnd });
    expect(byMonth.get("2026-09")).toBeCloseTo(2.9, 6);

    // A single customer org never receives org-wide provider totals.
    const orgScoped = await sumLedgerAiCostUsd({ start: rangeStart, end: rangeEnd, organizationId: "org_1" });
    expect(orgScoped.byProvider.get("provider.openai")?.source).toBe("estimated");
    expect(orgScoped.aiCostUsd).toBeCloseTo(1.4, 6);
  }, 60_000);
});
