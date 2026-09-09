/**
 * Accounting tests — cost calculation, normalization, idempotency, projection,
 * late completion, eligibility, billing boundaries, decimal safety.
 */

import { CostCalculator } from "../../../src/platform/accounting/cost/cost-calculator";
import { InMemoryPricingRegistry } from "../../../src/platform/accounting/pricing/pricing-registry";
import { buildPricingRecordsFromSeed } from "../../../src/platform/accounting/pricing/pricing-seed-loader";
import {
  normalizeOpenAiUsage,
  normalizeAnthropicUsage,
  normalizeGeminiUsage,
  normalizeImageUsage,
  normalizeVideoUsage,
  normalizeAudioUsage,
} from "../../../src/platform/accounting/usage/adapters/normalize-provider-usage";
import { InMemoryUsageLedger } from "../../../src/platform/accounting/ledger/usage-ledger";
import { UsageAccountingService } from "../../../src/platform/accounting/usage/usage-accounting-service";
import { AI_COST_STATUS, PRICING_UNIT } from "../../../src/platform/accounting/contracts/enums";
import { projectCurrentPeriodSpend } from "../../../src/platform/accounting/analytics/projection";
import { billingPeriodBoundsForDate } from "../../../src/platform/accounting/contracts/billing-period";
import {
  aggregateEligibleRecords,
  verifyBreakdownReconciles,
  isInPeriod,
} from "../../../src/platform/accounting/eligibility/accounting-eligibility";
import { deriveExecutionCostSummary } from "../../../src/platform/accounting/cost/execution-cost-deriver";
import { addUsd, parseUsdToMicro, microToUsdString } from "../../../src/platform/accounting/money/usd-money";
import { deriveIdempotencyKey } from "../../../src/platform/accounting/contracts/ai-usage-record";
import { OpenAIBillingAdapter } from "../../../src/platform/accounting/reconciliation/openai-billing-adapter";
import type { ProviderExecutionRequest } from "../../../src/platform/providers/runtime/contracts/provider-execution-request";
import {
  asCapabilityId,
  asExecutionId,
  asOrganizationId,
  asProviderId,
  asWorkspaceId,
} from "../../../src/platform/core/identifiers";

function baseRequest(overrides?: Partial<ProviderExecutionRequest>): ProviderExecutionRequest {
  const now = "2026-09-15T12:00:00.000Z";
  return {
    requestId: "req_1",
    context: {
      executionId: asExecutionId("exec_1"),
      organizationId: asOrganizationId("org_1"),
      workspaceId: asWorkspaceId("ws_1"),
      providerId: asProviderId("provider.openai"),
    },
    capabilityId: asCapabilityId("text.generate"),
    providerId: asProviderId("provider.openai"),
    modelId: "gpt-4o",
    payload: {},
    retryPolicy: { strategy: "none", maxAttempts: 1, baseDelayMs: 0 },
    timeoutPolicy: { queueTimeoutMs: 1000, executionTimeoutMs: 1000, streamingTimeoutMs: 1000 },
    streaming: false,
    priority: 0,
    createdAt: now,
    ...overrides,
  };
}

describe("accounting", () => {
  const now = "2026-09-15T12:00:00.000Z";
  const pricing = new InMemoryPricingRegistry(buildPricingRecordsFromSeed(now));

  it("normalizes OpenAI token usage", () => {
    const usage = normalizeOpenAiUsage(
      {
        prompt_tokens: 1000,
        completion_tokens: 500,
        total_tokens: 1500,
        completion_tokens_details: { reasoning_tokens: 100 },
      },
      "req_openai_1"
    );
    expect(usage.inputTokens).toBe(1000);
    expect(usage.outputTokens).toBe(500);
    expect(usage.reasoningTokens).toBe(100);
    expect(usage.providerRequestId).toBe("req_openai_1");
  });

  it("normalizes Anthropic cached token usage", () => {
    const usage = normalizeAnthropicUsage({
      input_tokens: 200,
      output_tokens: 80,
      cache_read_input_tokens: 50,
    });
    expect(usage.cachedInputTokens).toBe(50);
  });

  it("normalizes Gemini usageMetadata fields", () => {
    const usage = normalizeGeminiUsage({
      usageMetadata: {
        promptTokenCount: 300,
        candidatesTokenCount: 120,
        cachedContentTokenCount: 40,
        totalTokenCount: 420,
      },
    });
    expect(usage.inputTokens).toBe(300);
    expect(usage.outputTokens).toBe(120);
    expect(usage.cachedInputTokens).toBe(40);
  });

  it("normalizes image usage without guessing tokens", () => {
    const usage = normalizeImageUsage({ images: 1 });
    expect(usage.inputTokens).toBeNull();
    expect(usage.otherUnits).toEqual([{ unit: PRICING_UNIT.IMAGE, quantity: 1 }]);
  });

  it("normalizes video usage in seconds", () => {
    const usage = normalizeVideoUsage({ duration_seconds: 5.5 });
    expect(usage.inputTokens).toBeNull();
    expect(usage.otherUnits).toEqual([{ unit: PRICING_UNIT.VIDEO_SECOND, quantity: 5.5 }]);
  });

  it("normalizes audio usage", () => {
    const usage = normalizeAudioUsage({ seconds: 12 });
    expect(usage.otherUnits).toEqual([{ unit: PRICING_UNIT.AUDIO_SECOND, quantity: 12 }]);
  });

  it("normalizes embedding usage via token fields", () => {
    const usage = normalizeOpenAiUsage({ prompt_tokens: 512, total_tokens: 512 });
    expect(usage.inputTokens).toBe(512);
    expect(usage.totalTokens).toBe(512);
  });

  it("calculates token cost from pricing registry", () => {
    const calculator = new CostCalculator(pricing);
    const result = calculator.calculate({
      providerId: "provider.openai",
      modelId: "gpt-4o",
      capabilityId: "text.generate",
      asOf: now,
      usage: normalizeOpenAiUsage({ prompt_tokens: 1_000_000, completion_tokens: 0 }),
    });
    expect(result.costStatus).toBe(AI_COST_STATUS.CALCULATED);
    expect(Number(result.estimatedTotalCostUsd)).toBeGreaterThan(0);
    expect(result.pricingVersion).toBe("seed-v1");
  });

  it("uses pricing effective at invocation time (version safety)", () => {
    const registry = new InMemoryPricingRegistry([
      ...buildPricingRecordsFromSeed("2026-01-01T00:00:00.000Z"),
    ]);
    const calculator = new CostCalculator(registry);
    const day1 = calculator.calculate({
      providerId: "provider.openai",
      modelId: "gpt-4o",
      capabilityId: "text.generate",
      asOf: "2026-01-15T00:00:00.000Z",
      usage: normalizeOpenAiUsage({ prompt_tokens: 1_000_000, completion_tokens: 0 }),
    });
    const day2 = calculator.calculate({
      providerId: "provider.openai",
      modelId: "gpt-4o",
      capabilityId: "text.generate",
      asOf: "2026-09-15T00:00:00.000Z",
      usage: normalizeOpenAiUsage({ prompt_tokens: 1_000_000, completion_tokens: 0 }),
    });
    expect(day1.estimatedTotalCostUsd).toBe(day2.estimatedTotalCostUsd);
    expect(day1.pricingEffectiveAt).not.toBeNull();
  });

  it("returns pending pricing when model pricing requires configuration", () => {
    const calculator = new CostCalculator(pricing);
    const result = calculator.calculate({
      providerId: "provider.runway",
      modelId: "gen-3-alpha",
      capabilityId: "video.generate",
      asOf: now,
      usage: normalizeVideoUsage({ duration_seconds: 5 }),
    });
    expect(result.costStatus).toBe(AI_COST_STATUS.PENDING_PRICING);
    expect(result.estimatedTotalCostUsd).toBeNull();
  });

  it("returns pending provider usage when no billable units exist", () => {
    const calculator = new CostCalculator(pricing);
    const result = calculator.calculate({
      providerId: "provider.openai",
      modelId: "gpt-4o",
      capabilityId: "text.generate",
      asOf: now,
      usage: {
        inputTokens: null,
        outputTokens: null,
        cachedInputTokens: null,
        cachedOutputTokens: null,
        reasoningTokens: null,
        totalTokens: null,
        otherUnits: [],
        providerRequestId: null,
        rawProviderUsage: null,
      },
    });
    expect(result.costStatus).toBe(AI_COST_STATUS.PENDING_PROVIDER_USAGE);
    expect(result.estimatedTotalCostUsd).toBeNull();
  });

  it("is idempotent for duplicate provider invocations", async () => {
    const ledger = new InMemoryUsageLedger();
    const accounting = new UsageAccountingService(ledger, pricing);
    const request = baseRequest();

    const event = {
      request,
      response: {
        requestId: "req_1",
        providerId: asProviderId("provider.openai"),
        output: {},
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        providerRequestId: "prov_req_dup",
        streamed: false,
        finishedAt: now,
      },
      success: true,
      completedAt: now,
    };

    await accounting.recordProviderInvocation(event);
    await accounting.recordProviderInvocation(event);
    const records = await ledger.listByExecutionId("exec_1");
    expect(records).toHaveLength(1);
  });

  it("creates separate records for genuine provider retries", async () => {
    const ledger = new InMemoryUsageLedger();
    const accounting = new UsageAccountingService(ledger, pricing);
    const request = baseRequest();

    await accounting.recordProviderInvocation({
      request,
      response: {
        requestId: "req_1",
        providerId: asProviderId("provider.openai"),
        output: {},
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        providerRequestId: "prov_retry_1",
        streamed: false,
        finishedAt: now,
      },
      success: true,
      completedAt: now,
      pipelineAttempt: 1,
      sessionId: "sess_1",
    });
    await accounting.recordProviderInvocation({
      request,
      response: {
        requestId: "req_1",
        providerId: asProviderId("provider.openai"),
        output: {},
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        providerRequestId: "prov_retry_2",
        streamed: false,
        finishedAt: now,
      },
      success: true,
      completedAt: now,
      pipelineAttempt: 2,
      sessionId: "sess_2",
    });

    const records = await ledger.listByExecutionId("exec_1");
    expect(records).toHaveLength(2);
  });

  it("reconciles late completion without duplicating timeout record", async () => {
    const ledger = new InMemoryUsageLedger();
    const accounting = new UsageAccountingService(ledger, pricing);
    const request = baseRequest();

    await accounting.recordProviderInvocation({
      request,
      success: false,
      completedAt: now,
      timedOut: true,
      pipelineAttempt: 1,
      sessionId: "sess_timeout",
      operationId: "op_late_1",
    });

    await accounting.reconcileLateCompletion({
      request,
      response: {
        requestId: "req_1",
        providerId: asProviderId("provider.openai"),
        output: {},
        usage: { prompt_tokens: 200, completion_tokens: 100, total_tokens: 300 },
        providerRequestId: "prov_late_complete",
        streamed: false,
        finishedAt: now,
      },
      success: true,
      completedAt: now,
      operationId: "op_late_1",
      providerJobId: "job_123",
    });

    const records = await ledger.listByExecutionId("exec_1");
    expect(records).toHaveLength(1);
    expect(records[0]?.cost.costStatus).toBe(AI_COST_STATUS.CALCULATED);
    expect(records[0]?.usage.inputTokens).toBe(200);
  });

  it("derives execution cost as sum of usage records", async () => {
    const ledger = new InMemoryUsageLedger();
    const accounting = new UsageAccountingService(ledger, pricing);
    const request = baseRequest();

    await accounting.recordProviderInvocation({
      request,
      response: {
        requestId: "req_1",
        providerId: asProviderId("provider.openai"),
        output: {},
        usage: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
        providerRequestId: "prov_exec_sum_1",
        streamed: false,
        finishedAt: now,
      },
      success: true,
      completedAt: now,
    });
    await accounting.recordProviderInvocation({
      request: { ...request, requestId: "req_2" },
      response: {
        requestId: "req_2",
        providerId: asProviderId("provider.openai"),
        output: {},
        usage: { prompt_tokens: 2000, completion_tokens: 0, total_tokens: 2000 },
        providerRequestId: "prov_exec_sum_2",
        streamed: false,
        finishedAt: now,
      },
      success: true,
      completedAt: now,
    });

    const records = await ledger.listByExecutionId("exec_1");
    const summary = deriveExecutionCostSummary("exec_1", records);
    expect(summary.status).toBe("calculated");
    expect(summary.amount).toBeGreaterThan(0);
  });

  it("projects spend only after 24h of period data", () => {
    const bounds = billingPeriodBoundsForDate(new Date("2026-09-01T01:00:00.000Z"));
    const early = projectCurrentPeriodSpend({
      currentKnownSpendUsd: "10",
      now: new Date(bounds.periodStart.getTime() + 60_000),
    });
    expect(early.projectedSpendUsd).toBeNull();
    expect(early.projectionStatus).toBe("INSUFFICIENT_DATA");

    const later = projectCurrentPeriodSpend({
      currentKnownSpendUsd: "10",
      now: new Date(bounds.periodStart.getTime() + 25 * 60 * 60 * 1000),
    });
    expect(later.projectedSpendUsd).not.toBeNull();
    expect(later.projectionStatus).toBe("PROJECTED");
  });

  it("returns zero projection for zero usage", () => {
    const bounds = billingPeriodBoundsForDate(new Date("2026-09-01T01:00:00.000Z"));
    const result = projectCurrentPeriodSpend({
      currentKnownSpendUsd: "0",
      now: new Date(bounds.periodStart.getTime() + 25 * 60 * 60 * 1000),
    });
    expect(result.projectedSpendUsd).toBe("0");
  });

  it("uses UTC billing month boundaries (>= start, < end)", () => {
    const aug = billingPeriodBoundsForDate(new Date("2026-08-31T23:59:59.000Z"));
    const sep = billingPeriodBoundsForDate(new Date("2026-09-01T00:00:00.000Z"));
    expect(aug.billingPeriod).toBe("2026-08");
    expect(sep.billingPeriod).toBe("2026-09");

    const periodStart = aug.periodStart;
    const periodEnd = aug.periodEnd;
    expect(isInPeriod(
      {
        completedAt: "2026-08-31T23:59:59.999Z",
      } as never,
      { start: periodStart, end: periodEnd }
    )).toBe(true);
    expect(isInPeriod(
      {
        completedAt: "2026-09-01T00:00:00.000Z",
      } as never,
      { start: periodStart, end: periodEnd }
    )).toBe(false);
  });

  it("never converts pending costs to zero in eligibility aggregation", async () => {
    const ledger = new InMemoryUsageLedger();
    const accounting = new UsageAccountingService(ledger, pricing);
    const request = baseRequest({
      providerId: asProviderId("provider.runway"),
      modelId: "gen-3-alpha",
      capabilityId: asCapabilityId("video.generate"),
    });

    await accounting.recordProviderInvocation({
      request,
      response: {
        requestId: "req_1",
        providerId: asProviderId("provider.runway"),
        output: {},
        usage: { duration_seconds: 5 },
        providerRequestId: "prov_pending_1",
        streamed: false,
        finishedAt: now,
      },
      success: true,
      completedAt: now,
    });

    const records = await ledger.listByExecutionId("exec_1");
    const bounds = billingPeriodBoundsForDate(new Date(now));
    const totals = aggregateEligibleRecords(records, {
      start: bounds.periodStart,
      end: bounds.periodEnd,
    });
    expect(totals.liveInternalSpendUsd).toBe("0");
    expect(totals.pendingRequestCount).toBe(1);
    expect(totals.pendingSpendUsd).toBeNull();
  });

  it("reconciles provider breakdown to overall live spend", () => {
    const records = [
      {
        completedAt: "2026-09-10T12:00:00.000Z",
        organizationId: "org_1",
        providerId: "provider.openai",
        invocationStatus: "SUCCEEDED",
        usage: { inputTokens: 100, outputTokens: 50 },
        cost: {
          costStatus: AI_COST_STATUS.CALCULATED,
          reportingAmountUsd: "1.50",
          estimatedTotalCostUsd: "1.50",
        },
      },
      {
        completedAt: "2026-09-11T12:00:00.000Z",
        organizationId: "org_1",
        providerId: "provider.anthropic",
        invocationStatus: "SUCCEEDED",
        usage: { inputTokens: 200, outputTokens: 80 },
        cost: {
          costStatus: AI_COST_STATUS.CALCULATED,
          reportingAmountUsd: "2.50",
          estimatedTotalCostUsd: "2.50",
        },
      },
    ] as never[];

    const bounds = billingPeriodBoundsForDate(new Date("2026-09-15T00:00:00.000Z"));
    const filter = { start: bounds.periodStart, end: bounds.periodEnd };
    const totals = aggregateEligibleRecords(records, filter);
    const providerSum = addUsd("1.50", "2.50");
    expect(verifyBreakdownReconciles(totals.liveInternalSpendUsd, [providerSum])).toBe(true);
  });

  it("uses decimal-safe USD arithmetic", () => {
    const sum = addUsd("0.10", "0.20");
    expect(sum).toBe("0.3");
    const micro = parseUsdToMicro("0.000001");
    expect(micro).toBe(BigInt(1));
    expect(microToUsdString(BigInt(1000000))).toBe("1");
  });

  it("derives deterministic idempotency keys", () => {
    const key1 = deriveIdempotencyKey({
      providerId: "provider.openai",
      providerRequestId: "req_abc",
      executionId: "exec_1",
      internalRequestId: "int_1",
    });
    expect(key1).toBe("provider.openai:req_abc");

    const key2 = deriveIdempotencyKey({
      providerId: "provider.openai",
      executionId: "exec_1",
      internalRequestId: "int_1",
      sessionId: "sess_1",
      pipelineAttempt: 2,
    });
    expect(key2).toContain("exec_1");
    expect(key2).toContain("sess_1");
  });

  it("parses OpenAI billing API response without inventing endpoints", () => {
    const adapter = new OpenAIBillingAdapter();
    const page = (adapter as unknown as { parseCostsPage(body: unknown): unknown }).parseCostsPage({
      data: [
        {
          start_time: 1725148800,
          results: [
            {
              line_item: "gpt-4o",
              amount: { value: "12.34", currency: "usd" },
            },
          ],
        },
      ],
      next_page: null,
    }) as { lines: { amount: string; providerUsageId: string }[] };
    expect(page.lines).toHaveLength(1);
    expect(page.lines[0]?.amount).toBe("12.34");
    expect(page.lines[0]?.providerUsageId).toContain("openai:");
  });
});
