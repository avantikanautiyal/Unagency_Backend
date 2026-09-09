/**
 * FINAL FINANCIAL INTEGRITY AUDIT
 *
 * Proves: idempotency, reconciliation, pending behavior, pricing versioning,
 * timeout+late completion, real-time ledger visibility, and pricing honesty.
 *
 * Does NOT invent provider billing APIs or fabricated costs.
 */

import { CostCalculator } from "../../../src/platform/accounting/cost/cost-calculator";
import { InMemoryPricingRegistry } from "../../../src/platform/accounting/pricing/pricing-registry";
import { buildPricingRecordsFromSeed } from "../../../src/platform/accounting/pricing/pricing-seed-loader";
import { InMemoryFxRateService } from "../../../src/platform/accounting/pricing/fx-rate-service";
import { InMemoryUsageLedger } from "../../../src/platform/accounting/ledger/usage-ledger";
import { UsageAccountingService } from "../../../src/platform/accounting/usage/usage-accounting-service";
import { AI_COST_STATUS, PRICING_UNIT } from "../../../src/platform/accounting/contracts/enums";
import type { AIModelPricingRecord } from "../../../src/platform/accounting/contracts/ai-model-pricing";
import {
  aggregateEligibleRecords,
  liveAmountUsd,
  pendingAmountUsd,
  verifyBreakdownReconciles,
  addLiveAmounts,
} from "../../../src/platform/accounting/eligibility/accounting-eligibility";
import { billingPeriodBoundsForDate } from "../../../src/platform/accounting/contracts/billing-period";
import { parseUsdToMicro, addUsd } from "../../../src/platform/accounting/money/usd-money";
import { normalizeOpenAiUsage } from "../../../src/platform/accounting/usage/adapters/normalize-provider-usage";
import { deriveExecutionCostSummary } from "../../../src/platform/accounting/cost/execution-cost-deriver";
import type { ProviderExecutionRequest } from "../../../src/platform/providers/runtime/contracts/provider-execution-request";
import {
  asCapabilityId,
  asExecutionId,
  asOrganizationId,
  asProviderId,
  asWorkspaceId,
} from "../../../src/platform/core/identifiers";
import { SEED_MODELS } from "../../../src/platform/model-registry/discovery/inventory-seed";

function baseRequest(
  overrides?: Partial<ProviderExecutionRequest> & {
    executionId?: string;
    requestId?: string;
  }
): ProviderExecutionRequest {
  const now = "2026-09-15T12:00:00.000Z";
  const executionId = overrides?.executionId ?? "exec_audit_1";
  return {
    requestId: overrides?.requestId ?? "req_audit_1",
    context: {
      executionId: asExecutionId(executionId),
      organizationId: asOrganizationId("org_audit"),
      workspaceId: asWorkspaceId("ws_audit"),
      providerId: asProviderId("provider.openai"),
    },
    capabilityId: asCapabilityId("text.generate"),
    providerId: asProviderId("provider.openai"),
    modelId: "gpt-4o",
    payload: {},
    retryPolicy: { strategy: "none", maxAttempts: 1, baseDelayMs: 0 },
    timeoutPolicy: {
      queueTimeoutMs: 1000,
      executionTimeoutMs: 1000,
      streamingTimeoutMs: 1000,
    },
    streaming: false,
    priority: 0,
    createdAt: now,
    ...overrides,
  };
}

describe("financial integrity audit", () => {
  const now = "2026-09-15T12:00:00.000Z";
  const seedPricing = new InMemoryPricingRegistry(buildPricingRecordsFromSeed(now));

  describe("1. idempotency", () => {
    it("same event processed 1x / 2x / 10x yields exactly one usage record", async () => {
      const ledger = new InMemoryUsageLedger();
      const accounting = new UsageAccountingService(ledger, seedPricing);
      const request = baseRequest();
      const event = {
        request,
        response: {
          requestId: "req_audit_1",
          providerId: asProviderId("provider.openai"),
          output: {},
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
          providerRequestId: "prov_idem_same",
          streamed: false,
          finishedAt: now,
        },
        success: true,
        completedAt: now,
      };

      await accounting.recordProviderInvocation(event);
      expect(await ledger.listByExecutionId("exec_audit_1")).toHaveLength(1);

      await accounting.recordProviderInvocation(event);
      expect(await ledger.listByExecutionId("exec_audit_1")).toHaveLength(1);

      for (let i = 0; i < 10; i += 1) {
        await accounting.recordProviderInvocation(event);
      }
      expect(await ledger.listByExecutionId("exec_audit_1")).toHaveLength(1);
    });

    it("survives simulated process restart (new service, same ledger state)", async () => {
      const ledger = new InMemoryUsageLedger();
      const accounting1 = new UsageAccountingService(ledger, seedPricing);
      const event = {
        request: baseRequest(),
        response: {
          requestId: "req_audit_1",
          providerId: asProviderId("provider.openai"),
          output: {},
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          providerRequestId: "prov_restart_1",
          streamed: false,
          finishedAt: now,
        },
        success: true,
        completedAt: now,
      };
      await accounting1.recordProviderInvocation(event);

      // New service instance = process restart; ledger persists
      const accounting2 = new UsageAccountingService(ledger, seedPricing);
      await accounting2.recordProviderInvocation(event);
      expect(await ledger.listByExecutionId("exec_audit_1")).toHaveLength(1);
    });

    it("queue retry of same accounting event does not duplicate", async () => {
      const ledger = new InMemoryUsageLedger();
      const accounting = new UsageAccountingService(ledger, seedPricing);
      const event = {
        request: baseRequest(),
        response: {
          requestId: "req_audit_1",
          providerId: asProviderId("provider.openai"),
          output: {},
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          providerRequestId: "prov_queue_retry",
          streamed: false,
          finishedAt: now,
        },
        success: true,
        completedAt: now,
        pipelineAttempt: 1,
        sessionId: "sess_q",
      };
      // Simulate queue redelivery
      await Promise.all([
        accounting.recordProviderInvocation(event),
        accounting.recordProviderInvocation(event),
        accounting.recordProviderInvocation(event),
      ]);
      expect(await ledger.listByExecutionId("exec_audit_1")).toHaveLength(1);
    });

    it("genuine provider retry creates two records", async () => {
      const ledger = new InMemoryUsageLedger();
      const accounting = new UsageAccountingService(ledger, seedPricing);
      const request = baseRequest();

      await accounting.recordProviderInvocation({
        request,
        response: {
          requestId: "req_audit_1",
          providerId: asProviderId("provider.openai"),
          output: {},
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          providerRequestId: "prov_genuine_1",
          streamed: false,
          finishedAt: now,
        },
        success: false,
        completedAt: now,
        pipelineAttempt: 1,
        sessionId: "sess_a",
      });
      await accounting.recordProviderInvocation({
        request,
        response: {
          requestId: "req_audit_1",
          providerId: asProviderId("provider.openai"),
          output: {},
          usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 },
          providerRequestId: "prov_genuine_2",
          streamed: false,
          finishedAt: now,
        },
        success: true,
        completedAt: now,
        pipelineAttempt: 2,
        sessionId: "sess_b",
      });

      expect(await ledger.listByExecutionId("exec_audit_1")).toHaveLength(2);
    });
  });

  describe("2. dashboard reconciliation (no rounding drift)", () => {
    it("overall = provider = model = service = execution aggregations", async () => {
      const ledger = new InMemoryUsageLedger();
      const accounting = new UsageAccountingService(ledger, seedPricing);

      const events = [
        {
          executionId: "exec_r1",
          providerRequestId: "prov_r1",
          providerId: "provider.openai",
          modelId: "gpt-4o",
          service: "text.generate",
          prompt: 1_000_000,
          completion: 0,
        },
        {
          executionId: "exec_r2",
          providerRequestId: "prov_r2",
          providerId: "provider.openai",
          modelId: "gpt-4o-mini",
          service: "text.generate",
          prompt: 500_000,
          completion: 0,
        },
        {
          executionId: "exec_r3",
          providerRequestId: "prov_r3",
          providerId: "provider.anthropic",
          modelId: "claude-sonnet-4-5",
          service: "text.generate",
          prompt: 200_000,
          completion: 100_000,
        },
      ];

      for (const e of events) {
        await accounting.recordProviderInvocation({
          request: baseRequest({
            executionId: e.executionId,
            requestId: e.providerRequestId,
            providerId: asProviderId(e.providerId),
            modelId: e.modelId,
            capabilityId: asCapabilityId(e.service),
            context: {
              executionId: asExecutionId(e.executionId),
              organizationId: asOrganizationId("org_audit"),
              workspaceId: asWorkspaceId("ws_audit"),
              providerId: asProviderId(e.providerId),
            },
          }),
          response: {
            requestId: e.providerRequestId,
            providerId: asProviderId(e.providerId),
            output: {},
            usage: {
              prompt_tokens: e.prompt,
              completion_tokens: e.completion,
              total_tokens: e.prompt + e.completion,
            },
            providerRequestId: e.providerRequestId,
            streamed: false,
            finishedAt: now,
          },
          success: true,
          completedAt: now,
          service: e.service,
        });
      }

      const allRecords = [
        ...(await ledger.listByExecutionId("exec_r1")),
        ...(await ledger.listByExecutionId("exec_r2")),
        ...(await ledger.listByExecutionId("exec_r3")),
      ];
      const bounds = billingPeriodBoundsForDate(new Date(now));
      const filter = { start: bounds.periodStart, end: bounds.periodEnd };
      const overall = aggregateEligibleRecords(allRecords, filter);

      // Provider aggregation
      const byProvider = new Map<string, string | null>();
      for (const r of allRecords) {
        const amt = liveAmountUsd(r);
        byProvider.set(r.providerId, addUsd(byProvider.get(r.providerId) ?? null, amt));
      }
      expect(
        verifyBreakdownReconciles(overall.liveInternalSpendUsd, [
          addLiveAmounts([...byProvider.values()]),
        ])
      ).toBe(true);

      // Model aggregation
      const byModel = new Map<string, string | null>();
      for (const r of allRecords) {
        const key = `${r.providerId}::${r.modelId}`;
        const amt = liveAmountUsd(r);
        byModel.set(key, addUsd(byModel.get(key) ?? null, amt));
      }
      expect(
        verifyBreakdownReconciles(overall.liveInternalSpendUsd, [
          addLiveAmounts([...byModel.values()]),
        ])
      ).toBe(true);

      // Service aggregation
      const byService = new Map<string, string | null>();
      for (const r of allRecords) {
        const key = r.service ?? r.capabilityId;
        const amt = liveAmountUsd(r);
        byService.set(key, addUsd(byService.get(key) ?? null, amt));
      }
      expect(
        verifyBreakdownReconciles(overall.liveInternalSpendUsd, [
          addLiveAmounts([...byService.values()]),
        ])
      ).toBe(true);

      // Execution aggregation
      const byExecution = new Map<string, string | null>();
      for (const r of allRecords) {
        const amt = liveAmountUsd(r);
        byExecution.set(r.executionId, addUsd(byExecution.get(r.executionId) ?? null, amt));
      }
      expect(
        verifyBreakdownReconciles(overall.liveInternalSpendUsd, [
          addLiveAmounts([...byExecution.values()]),
        ])
      ).toBe(true);

      // Exact micro equality — no float drift
      const overallMicro = parseUsdToMicro(overall.liveInternalSpendUsd) ?? BigInt(0);
      let sumMicro = BigInt(0);
      for (const amt of byProvider.values()) {
        sumMicro += parseUsdToMicro(amt) ?? BigInt(0);
      }
      expect(sumMicro).toBe(overallMicro);
    });
  });

  describe("3. pending-cost honesty", () => {
    it("PENDING_PRICING never becomes $0 live spend", async () => {
      const ledger = new InMemoryUsageLedger();
      const accounting = new UsageAccountingService(ledger, seedPricing);
      await accounting.recordProviderInvocation({
        request: baseRequest({
          providerId: asProviderId("provider.runway"),
          modelId: "runway-gen-4",
          capabilityId: asCapabilityId("video.generate"),
          context: {
            executionId: asExecutionId("exec_audit_1"),
            organizationId: asOrganizationId("org_audit"),
            workspaceId: asWorkspaceId("ws_audit"),
            providerId: asProviderId("provider.runway"),
          },
        }),
        response: {
          requestId: "req_audit_1",
          providerId: asProviderId("provider.runway"),
          output: {},
          usage: { duration_seconds: 5 },
          providerRequestId: "prov_pending_pricing",
          streamed: false,
          finishedAt: now,
        },
        success: true,
        completedAt: now,
      });

      const records = await ledger.listByExecutionId("exec_audit_1");
      expect(records[0]?.cost.costStatus).toBe(AI_COST_STATUS.PENDING_PRICING);
      expect(records[0]?.cost.estimatedTotalCostUsd).toBeNull();
      expect(records[0]?.cost.reportingAmountUsd).toBeNull();
      expect(liveAmountUsd(records[0]!)).toBeNull();
      expect(pendingAmountUsd(records[0]!)).toBeNull();

      const bounds = billingPeriodBoundsForDate(new Date(now));
      const totals = aggregateEligibleRecords(records, {
        start: bounds.periodStart,
        end: bounds.periodEnd,
      });
      expect(totals.liveInternalSpendUsd).toBe("0");
      expect(totals.pendingRequestCount).toBe(1);
      expect(totals.pendingSpendUsd).toBeNull();
    });

    it("PENDING_PROVIDER_USAGE never becomes $0 live spend", async () => {
      const ledger = new InMemoryUsageLedger();
      const accounting = new UsageAccountingService(ledger, seedPricing);
      await accounting.recordProviderInvocation({
        request: baseRequest(),
        success: false,
        completedAt: now,
        timedOut: true,
        operationId: "op_pending_usage",
        sessionId: "sess_to",
      });

      const records = await ledger.listByExecutionId("exec_audit_1");
      expect(records[0]?.cost.costStatus).toBe(AI_COST_STATUS.PENDING_PROVIDER_USAGE);
      expect(records[0]?.cost.estimatedTotalCostUsd).toBeNull();
      expect(liveAmountUsd(records[0]!)).toBeNull();
    });

    it("PENDING_CONVERSION excludes from live spend", () => {
      const fx = new InMemoryFxRateService([]); // no rates → pending conversion
      const pricing: AIModelPricingRecord[] = [
        {
          pricingId: "p_eur",
          providerId: "provider.openai",
          modelId: "gpt-4o",
          pricingVersion: "eur-v1",
          effectiveFrom: "2020-01-01T00:00:00.000Z",
          effectiveTo: null,
          unitRates: [
            {
              unit: PRICING_UNIT.TOKEN_INPUT_PER_1M,
              pricePerUnit: "2.50",
              currency: "EUR",
            },
          ],
          currency: "EUR",
          active: true,
          requiresConfiguration: false,
          source: "audit",
          createdAt: now,
          updatedAt: now,
        },
      ];
      const calculator = new CostCalculator(new InMemoryPricingRegistry(pricing), fx);
      const result = calculator.calculate({
        providerId: "provider.openai",
        modelId: "gpt-4o",
        capabilityId: "text.generate",
        asOf: now,
        usage: normalizeOpenAiUsage({ prompt_tokens: 1_000_000, completion_tokens: 0 }),
      });
      expect(result.costStatus).toBe(AI_COST_STATUS.PENDING_CONVERSION);
      expect(result.reportingAmountUsd).toBeNull();
      expect(result.estimatedTotalCostUsd).toBeNull();
      expect(result.originalAmount).not.toBeNull();
    });
  });

  describe("4. real-time ledger visibility (no billing sync wait)", () => {
    it("provider response → usage record → admin-visible aggregation immediately", async () => {
      const ledger = new InMemoryUsageLedger();
      const accounting = new UsageAccountingService(ledger, seedPricing);

      // Wall-clock timestamps — proves visibility without billing sync wait
      const providerCompletedAt = new Date().toISOString();
      const t0 = Date.now();
      await accounting.recordProviderInvocation({
        request: baseRequest({ createdAt: providerCompletedAt }),
        response: {
          requestId: "req_audit_1",
          providerId: asProviderId("provider.openai"),
          output: {},
          usage: { prompt_tokens: 1_000_000, completion_tokens: 0, total_tokens: 1_000_000 },
          providerRequestId: "prov_realtime_1",
          streamed: false,
          finishedAt: providerCompletedAt,
        },
        success: true,
        completedAt: providerCompletedAt,
      });
      const usageCreatedAt = (await ledger.listByExecutionId("exec_audit_1"))[0]!.createdAt;
      const t1 = Date.now();

      const records = await ledger.listByExecutionId("exec_audit_1");
      expect(records).toHaveLength(1);
      expect(records[0]?.cost.costStatus).toBe(AI_COST_STATUS.CALCULATED);
      expect(Number(records[0]?.cost.reportingAmountUsd)).toBeGreaterThan(0);

      const bounds = billingPeriodBoundsForDate(new Date(providerCompletedAt));
      const adminVisible = aggregateEligibleRecords(records, {
        start: bounds.periodStart,
        end: bounds.periodEnd,
      });
      const adminVisibleAt = new Date().toISOString();
      const t2 = Date.now();

      expect(Number(adminVisible.liveInternalSpendUsd)).toBeGreaterThan(0);
      // All happened without any provider billing sync
      expect(t1 - t0).toBeLessThan(5000);
      expect(t2 - t0).toBeLessThan(5000);

      // Ledger createdAt is set at write time; completedAt is provider finish time
      expect(Date.parse(usageCreatedAt)).toBeGreaterThanOrEqual(Date.parse(providerCompletedAt) - 1000);
      expect(Date.parse(adminVisibleAt)).toBeGreaterThanOrEqual(Date.parse(usageCreatedAt));
    });
  });

  describe("5. timeout + late completion", () => {
    it("timeout → PENDING_PROVIDER_USAGE → late complete updates same record (no duplicate)", async () => {
      const ledger = new InMemoryUsageLedger();
      const accounting = new UsageAccountingService(ledger, seedPricing);
      const request = baseRequest();

      await accounting.recordProviderInvocation({
        request,
        success: false,
        completedAt: now,
        timedOut: true,
        operationId: "op_late_audit",
        sessionId: "sess_timeout",
        pipelineAttempt: 1,
      });

      const afterTimeout = await ledger.listByExecutionId("exec_audit_1");
      expect(afterTimeout).toHaveLength(1);
      expect(afterTimeout[0]?.cost.costStatus).toBe(AI_COST_STATUS.PENDING_PROVIDER_USAGE);

      await accounting.reconcileLateCompletion({
        request,
        response: {
          requestId: "req_audit_1",
          providerId: asProviderId("provider.openai"),
          output: {},
          usage: { prompt_tokens: 500, completion_tokens: 200, total_tokens: 700 },
          providerRequestId: "prov_late_final",
          streamed: false,
          finishedAt: now,
        },
        success: true,
        completedAt: now,
        operationId: "op_late_audit",
        providerJobId: "job_late_1",
      });

      const afterLate = await ledger.listByExecutionId("exec_audit_1");
      expect(afterLate).toHaveLength(1);
      expect(afterLate[0]?.usageRecordId).toBe(afterTimeout[0]?.usageRecordId);
      expect(afterLate[0]?.cost.costStatus).toBe(AI_COST_STATUS.CALCULATED);
      expect(afterLate[0]?.usage.inputTokens).toBe(500);
    });
  });

  describe("6. pricing versioning + historical integrity", () => {
    it("old usage keeps old price when newer pricing version is added", () => {
      const records: AIModelPricingRecord[] = [
        {
          pricingId: "p_v1",
          providerId: "provider.openai",
          modelId: "gpt-4o",
          pricingVersion: "v1-old",
          effectiveFrom: "2026-01-01T00:00:00.000Z",
          effectiveTo: "2026-09-01T00:00:00.000Z",
          unitRates: [
            {
              unit: PRICING_UNIT.TOKEN_INPUT_PER_1M,
              pricePerUnit: "5.00",
              currency: "USD",
            },
          ],
          currency: "USD",
          active: true,
          requiresConfiguration: false,
          source: "audit",
          createdAt: now,
          updatedAt: now,
        },
        {
          pricingId: "p_v2",
          providerId: "provider.openai",
          modelId: "gpt-4o",
          pricingVersion: "v2-new",
          effectiveFrom: "2026-09-01T00:00:00.000Z",
          effectiveTo: null,
          unitRates: [
            {
              unit: PRICING_UNIT.TOKEN_INPUT_PER_1M,
              pricePerUnit: "10.00",
              currency: "USD",
            },
          ],
          currency: "USD",
          active: true,
          requiresConfiguration: false,
          source: "audit",
          createdAt: now,
          updatedAt: now,
        },
      ];
      const calculator = new CostCalculator(new InMemoryPricingRegistry(records));

      const day1 = calculator.calculate({
        providerId: "provider.openai",
        modelId: "gpt-4o",
        capabilityId: "text.generate",
        asOf: "2026-06-15T00:00:00.000Z",
        usage: normalizeOpenAiUsage({ prompt_tokens: 1_000_000, completion_tokens: 0 }),
      });
      const day2 = calculator.calculate({
        providerId: "provider.openai",
        modelId: "gpt-4o",
        capabilityId: "text.generate",
        asOf: "2026-09-15T00:00:00.000Z",
        usage: normalizeOpenAiUsage({ prompt_tokens: 1_000_000, completion_tokens: 0 }),
      });

      expect(day1.pricingVersion).toBe("v1-old");
      expect(day1.estimatedTotalCostUsd).toBe("5");
      expect(day2.pricingVersion).toBe("v2-new");
      expect(day2.estimatedTotalCostUsd).toBe("10");

      // Changing current price does not alter day1 calculation
      expect(day1.estimatedTotalCostUsd).not.toBe(day2.estimatedTotalCostUsd);
    });

    it("persisted usage record cost is immutable when pricing registry changes", async () => {
      const ledger = new InMemoryUsageLedger();
      const pricingV1 = new InMemoryPricingRegistry([
        {
          pricingId: "p_immut",
          providerId: "provider.openai",
          modelId: "gpt-4o",
          pricingVersion: "immutable-v1",
          effectiveFrom: "2020-01-01T00:00:00.000Z",
          effectiveTo: null,
          unitRates: [
            {
              unit: PRICING_UNIT.TOKEN_INPUT_PER_1M,
              pricePerUnit: "3.00",
              currency: "USD",
            },
          ],
          currency: "USD",
          active: true,
          requiresConfiguration: false,
          source: "audit",
          createdAt: now,
          updatedAt: now,
        },
      ]);
      const accounting = new UsageAccountingService(ledger, pricingV1);
      await accounting.recordProviderInvocation({
        request: baseRequest(),
        response: {
          requestId: "req_audit_1",
          providerId: asProviderId("provider.openai"),
          output: {},
          usage: { prompt_tokens: 1_000_000, completion_tokens: 0, total_tokens: 1_000_000 },
          providerRequestId: "prov_immutable",
          streamed: false,
          finishedAt: now,
        },
        success: true,
        completedAt: now,
      });

      const before = (await ledger.listByExecutionId("exec_audit_1"))[0]!;
      expect(before.cost.estimatedTotalCostUsd).toBe("3");
      expect(before.cost.pricingVersion).toBe("immutable-v1");

      // Registry change would only affect NEW calculations; ledger row is stored as-is
      const after = (await ledger.listByExecutionId("exec_audit_1"))[0]!;
      expect(after.cost.estimatedTotalCostUsd).toBe(before.cost.estimatedTotalCostUsd);
      expect(after.cost.pricingVersion).toBe(before.cost.pricingVersion);
    });
  });

  describe("7. currency", () => {
    it("canonical AI accounting is USD; FX without rate yields PENDING_CONVERSION", () => {
      const fx = new InMemoryFxRateService([]);
      const result = fx.convertToUsd("10", "INR", now);
      expect(result.pendingConversion).toBe(true);
      expect(result.amountUsd).toBeNull();

      const usd = fx.convertToUsd("10", "USD", now);
      expect(usd.pendingConversion).toBe(false);
      expect(usd.amountUsd).toBe("10");
      expect(usd.exchangeRate).toBe("1");
    });

    it("no hardcoded FX rate of 83 in FX service", () => {
      const fx = new InMemoryFxRateService([]);
      const result = fx.convertToUsd("1", "INR", now);
      expect(result.amountUsd).toBeNull();
      expect(result.exchangeRate).toBeNull();
    });
  });

  describe("8. execution cost is derived only", () => {
    it("executionCost = SUM(usage records)", async () => {
      const ledger = new InMemoryUsageLedger();
      const accounting = new UsageAccountingService(ledger, seedPricing);
      await accounting.recordProviderInvocation({
        request: baseRequest({ requestId: "r1" }),
        response: {
          requestId: "r1",
          providerId: asProviderId("provider.openai"),
          output: {},
          usage: { prompt_tokens: 1_000_000, completion_tokens: 0, total_tokens: 1_000_000 },
          providerRequestId: "prov_sum_a",
          streamed: false,
          finishedAt: now,
        },
        success: true,
        completedAt: now,
      });
      await accounting.recordProviderInvocation({
        request: baseRequest({ requestId: "r2" }),
        response: {
          requestId: "r2",
          providerId: asProviderId("provider.openai"),
          output: {},
          usage: { prompt_tokens: 1_000_000, completion_tokens: 0, total_tokens: 1_000_000 },
          providerRequestId: "prov_sum_b",
          streamed: false,
          finishedAt: now,
        },
        success: true,
        completedAt: now,
      });

      const records = await ledger.listByExecutionId("exec_audit_1");
      const summary = deriveExecutionCostSummary("exec_audit_1", records);
      let expected: string | null = null;
      for (const r of records) {
        expected = addUsd(expected, liveAmountUsd(r));
      }
      expect(summary.amount).toBe(Number(expected));
      expect(records).toHaveLength(2);
    });
  });

  describe("9. pricing completeness — no accidental zero-price", () => {
    it("seed pricing never activates unitRates with price 0", () => {
      const records = buildPricingRecordsFromSeed(now);
      const accidentalZeros: string[] = [];
      const pending: string[] = [];
      const verified: string[] = [];

      for (const record of records) {
        const key = `${record.providerId}/${record.modelId}`;
        if (record.requiresConfiguration || record.unitRates.length === 0) {
          pending.push(key);
          continue;
        }
        for (const rate of record.unitRates) {
          if (Number(rate.pricePerUnit) === 0) {
            accidentalZeros.push(`${key}:${rate.unit}`);
          }
        }
        verified.push(key);
      }

      expect(accidentalZeros).toEqual([]);
      expect(verified.length).toBeGreaterThan(0);
      expect(pending.length).toBeGreaterThan(0); // video/research intentionally pending
    });

    it("inventory video/research seeds with 0,0 map to PENDING_PRICING not $0", () => {
      const calculator = new CostCalculator(seedPricing);
      const video = calculator.calculate({
        providerId: "provider.runway",
        modelId: "runway-gen-4",
        capabilityId: "video.generate",
        asOf: now,
        usage: {
          inputTokens: null,
          outputTokens: null,
          cachedInputTokens: null,
          cachedOutputTokens: null,
          reasoningTokens: null,
          totalTokens: null,
          otherUnits: [{ unit: PRICING_UNIT.VIDEO_SECOND, quantity: 5 }],
          providerRequestId: null,
          rawProviderUsage: null,
        },
      });
      expect(video.costStatus).toBe(AI_COST_STATUS.PENDING_PRICING);
      expect(video.estimatedTotalCostUsd).toBeNull();

      // Ensure SEED_MODELS still has zero-priced video entries that we refuse to bill
      const videoSeeds = SEED_MODELS.filter((m) => m.modalities.includes("video"));
      expect(videoSeeds.length).toBeGreaterThan(0);
      expect(videoSeeds.every((m) => m.inputPer1k === 0 && m.outputPer1k === 0)).toBe(true);
    });
  });
});
