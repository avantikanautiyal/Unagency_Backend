/**
 * Accounting tests — cost calculation, normalization, idempotency, projection.
 */

import { CostCalculator } from "../../../src/platform/accounting/cost/cost-calculator";
import { InMemoryPricingRegistry } from "../../../src/platform/accounting/pricing/pricing-registry";
import { buildPricingRecordsFromSeed } from "../../../src/platform/accounting/pricing/pricing-seed-loader";
import {
  normalizeOpenAiUsage,
  normalizeAnthropicUsage,
  normalizeImageUsage,
} from "../../../src/platform/accounting/usage/adapters/normalize-provider-usage";
import { InMemoryUsageLedger } from "../../../src/platform/accounting/ledger/usage-ledger";
import { UsageAccountingService } from "../../../src/platform/accounting/usage/usage-accounting-service";
import { AI_COST_STATUS, PRICING_UNIT } from "../../../src/platform/accounting/contracts/enums";
import { projectCurrentPeriodSpend } from "../../../src/platform/accounting/analytics/projection";
import { billingPeriodBoundsForDate } from "../../../src/platform/accounting/contracts/billing-period";
import type { ProviderExecutionRequest } from "../../../src/platform/providers/runtime/contracts/provider-execution-request";
import { asCapabilityId, asExecutionId, asOrganizationId, asProviderId, asWorkspaceId } from "../../../src/platform/core/identifiers";

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

  it("normalizes image usage without guessing tokens", () => {
    const usage = normalizeImageUsage({ images: 1 });
    expect(usage.inputTokens).toBeNull();
    expect(usage.otherUnits).toEqual([{ unit: PRICING_UNIT.IMAGE, quantity: 1 }]);
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

  it("returns pending pricing when model pricing requires configuration", () => {
    const calculator = new CostCalculator(pricing);
    const result = calculator.calculate({
      providerId: "provider.runway",
      modelId: "gen-3-alpha",
      capabilityId: "video.generate",
      asOf: now,
      usage: normalizeImageUsage({ images: 1 }),
    });
    expect(result.costStatus).toBe(AI_COST_STATUS.PENDING_PRICING);
    expect(result.estimatedTotalCostUsd).toBeNull();
  });

  it("is idempotent for duplicate provider invocations", async () => {
    const ledger = new InMemoryUsageLedger();
    const accounting = new UsageAccountingService(ledger, pricing);
    const request: ProviderExecutionRequest = {
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
    };

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

  it("uses UTC billing month boundaries", () => {
    const aug = billingPeriodBoundsForDate(new Date("2026-08-31T23:59:59.000Z"));
    const sep = billingPeriodBoundsForDate(new Date("2026-09-01T00:00:00.000Z"));
    expect(aug.billingPeriod).toBe("2026-08");
    expect(sep.billingPeriod).toBe("2026-09");
  });
});
