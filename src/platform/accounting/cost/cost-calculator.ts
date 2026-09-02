/**
 * Canonical cost calculator — single path for all AI cost computation.
 */

import type { AICostBreakdown, AppliedUnitPrice } from "../contracts/ai-cost";
import { CALCULATION_VERSION } from "../contracts/ai-cost";
import type { NormalizedAIUsage } from "../contracts/ai-usage";
import { AI_COST_STATUS, PRICING_UNIT, REPORTING_CURRENCY } from "../contracts/enums";
import type { IPricingRegistry } from "../pricing/pricing-registry";
import type { IFxRateService } from "../pricing/fx-rate-service";
import { addUsd, divideTokensCost, multiplyUsdRate } from "../money/usd-money";

export interface CostCalculationInput {
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityId: string;
  readonly usage: NormalizedAIUsage;
  readonly asOf: string;
}

export class CostCalculator {
  constructor(
    private readonly pricing: IPricingRegistry,
    private readonly fx: IFxRateService = { convertToUsd: (amount, currency, asOf) => ({
      converted: currency.toUpperCase() === REPORTING_CURRENCY,
      amountUsd: amount,
      originalCurrency: currency.toUpperCase(),
      originalAmount: amount,
      exchangeRate: currency.toUpperCase() === REPORTING_CURRENCY ? "1" : null,
      exchangeRateVersion: currency.toUpperCase() === REPORTING_CURRENCY ? "usd-identity" : null,
      exchangeRateTimestamp: asOf,
      pendingConversion: currency.toUpperCase() !== REPORTING_CURRENCY,
    }) }
  ) {}

  calculate(input: CostCalculationInput): AICostBreakdown {
    const lookup = this.pricing.lookup(input.providerId, input.modelId, input.asOf);
    const applied: AppliedUnitPrice[] = [];

    if (!lookup.record || lookup.reason !== "found") {
      return this.pendingPricing(lookup.record);
    }

    const record = lookup.record;
    let inputCost: string | null = null;
    let outputCost: string | null = null;
    let cachedCost: string | null = null;
    let reasoningCost: string | null = null;
    let otherCost: string | null = null;

    const rateFor = (unit: string) =>
      record.unitRates.find((r) => r.unit === unit) ?? null;

    if (input.usage.inputTokens != null) {
      const rate = rateFor(PRICING_UNIT.TOKEN_INPUT_PER_1M);
      if (rate) {
        inputCost = divideTokensCost(input.usage.inputTokens, rate.pricePerUnit);
        if (inputCost) {
          applied.push({
            unit: PRICING_UNIT.TOKEN_INPUT_PER_1M,
            pricePerUnit: rate.pricePerUnit,
            quantity: input.usage.inputTokens,
            costUsd: inputCost,
          });
        }
      }
    }

    if (input.usage.outputTokens != null) {
      const rate = rateFor(PRICING_UNIT.TOKEN_OUTPUT_PER_1M);
      if (rate) {
        outputCost = divideTokensCost(input.usage.outputTokens, rate.pricePerUnit);
        if (outputCost) {
          applied.push({
            unit: PRICING_UNIT.TOKEN_OUTPUT_PER_1M,
            pricePerUnit: rate.pricePerUnit,
            quantity: input.usage.outputTokens,
            costUsd: outputCost,
          });
        }
      }
    }

    if (input.usage.cachedInputTokens != null) {
      const rate = rateFor(PRICING_UNIT.TOKEN_CACHED_INPUT_PER_1M);
      if (rate) {
        const part = divideTokensCost(input.usage.cachedInputTokens, rate.pricePerUnit);
        cachedCost = addUsd(cachedCost, part);
        if (part) {
          applied.push({
            unit: PRICING_UNIT.TOKEN_CACHED_INPUT_PER_1M,
            pricePerUnit: rate.pricePerUnit,
            quantity: input.usage.cachedInputTokens,
            costUsd: part,
          });
        }
      }
    }

    if (input.usage.cachedOutputTokens != null) {
      const rate = rateFor(PRICING_UNIT.TOKEN_CACHED_OUTPUT_PER_1M);
      if (rate) {
        const part = divideTokensCost(input.usage.cachedOutputTokens, rate.pricePerUnit);
        cachedCost = addUsd(cachedCost, part);
        if (part) {
          applied.push({
            unit: PRICING_UNIT.TOKEN_CACHED_OUTPUT_PER_1M,
            pricePerUnit: rate.pricePerUnit,
            quantity: input.usage.cachedOutputTokens,
            costUsd: part,
          });
        }
      }
    }

    if (input.usage.reasoningTokens != null) {
      const rate = rateFor(PRICING_UNIT.TOKEN_REASONING_PER_1M);
      if (rate) {
        reasoningCost = divideTokensCost(input.usage.reasoningTokens, rate.pricePerUnit);
        if (reasoningCost) {
          applied.push({
            unit: PRICING_UNIT.TOKEN_REASONING_PER_1M,
            pricePerUnit: rate.pricePerUnit,
            quantity: input.usage.reasoningTokens,
            costUsd: reasoningCost,
          });
        }
      }
    }

    for (const other of input.usage.otherUnits) {
      const rate = rateFor(other.unit);
      if (!rate) continue;
      const part = multiplyUsdRate(other.quantity, rate.pricePerUnit);
      otherCost = addUsd(otherCost, part);
      if (part) {
        applied.push({
          unit: other.unit,
          pricePerUnit: rate.pricePerUnit,
          quantity: other.quantity,
          costUsd: part,
        });
      }
    }

    const hasUsage =
      input.usage.inputTokens != null ||
      input.usage.outputTokens != null ||
      input.usage.cachedInputTokens != null ||
      input.usage.cachedOutputTokens != null ||
      input.usage.reasoningTokens != null ||
      input.usage.otherUnits.length > 0;

    if (!hasUsage) {
      return this.pendingProviderUsage(record);
    }

    const total =
      addUsd(
        addUsd(addUsd(addUsd(inputCost, outputCost), cachedCost), reasoningCost),
        otherCost
      );

    if (!total || applied.length === 0) {
      return this.pendingPricing(record);
    }

    const fx = this.fx.convertToUsd(total, record.currency, input.asOf);
    if (fx.pendingConversion) {
      return {
        estimatedInputCostUsd: inputCost,
        estimatedOutputCostUsd: outputCost,
        estimatedCachedCostUsd: cachedCost,
        estimatedReasoningCostUsd: reasoningCost,
        estimatedOtherCostUsd: otherCost,
        estimatedTotalCostUsd: null,
        originalCurrency: record.currency,
        originalAmount: total,
        reportingCurrency: REPORTING_CURRENCY,
        reportingAmountUsd: null,
        exchangeRate: null,
        exchangeRateVersion: null,
        exchangeRateTimestamp: null,
        costStatus: AI_COST_STATUS.PENDING_CONVERSION,
        pricingVersion: record.pricingVersion,
        pricingEffectiveAt: record.effectiveFrom,
        calculationVersion: CALCULATION_VERSION,
        unitPricesApplied: applied,
      };
    }

    return {
      estimatedInputCostUsd: inputCost,
      estimatedOutputCostUsd: outputCost,
      estimatedCachedCostUsd: cachedCost,
      estimatedReasoningCostUsd: reasoningCost,
      estimatedOtherCostUsd: otherCost,
      estimatedTotalCostUsd: total,
      originalCurrency: record.currency,
      originalAmount: total,
      reportingCurrency: REPORTING_CURRENCY,
      reportingAmountUsd: fx.amountUsd,
      exchangeRate: fx.exchangeRate,
      exchangeRateVersion: fx.exchangeRateVersion,
      exchangeRateTimestamp: fx.exchangeRateTimestamp,
      costStatus: AI_COST_STATUS.CALCULATED,
      pricingVersion: record.pricingVersion,
      pricingEffectiveAt: record.effectiveFrom,
      calculationVersion: CALCULATION_VERSION,
      unitPricesApplied: applied,
    };
  }

  private pendingPricing(
    record: { readonly pricingVersion: string; readonly effectiveFrom: string; readonly currency: string } | null
  ): AICostBreakdown {
    return {
      estimatedInputCostUsd: null,
      estimatedOutputCostUsd: null,
      estimatedCachedCostUsd: null,
      estimatedReasoningCostUsd: null,
      estimatedOtherCostUsd: null,
      estimatedTotalCostUsd: null,
      originalCurrency: record?.currency ?? REPORTING_CURRENCY,
      originalAmount: null,
      reportingCurrency: REPORTING_CURRENCY,
      reportingAmountUsd: null,
      exchangeRate: null,
      exchangeRateVersion: null,
      exchangeRateTimestamp: null,
      costStatus: AI_COST_STATUS.PENDING_PRICING,
      pricingVersion: record?.pricingVersion ?? null,
      pricingEffectiveAt: record?.effectiveFrom ?? null,
      calculationVersion: CALCULATION_VERSION,
      unitPricesApplied: [],
    };
  }

  private pendingProviderUsage(
    record: { readonly pricingVersion: string; readonly effectiveFrom: string; readonly currency: string }
  ): AICostBreakdown {
    return {
      estimatedInputCostUsd: null,
      estimatedOutputCostUsd: null,
      estimatedCachedCostUsd: null,
      estimatedReasoningCostUsd: null,
      estimatedOtherCostUsd: null,
      estimatedTotalCostUsd: null,
      originalCurrency: record.currency,
      originalAmount: null,
      reportingCurrency: REPORTING_CURRENCY,
      reportingAmountUsd: null,
      exchangeRate: null,
      exchangeRateVersion: null,
      exchangeRateTimestamp: null,
      costStatus: AI_COST_STATUS.PENDING_PROVIDER_USAGE,
      pricingVersion: record.pricingVersion,
      pricingEffectiveAt: record.effectiveFrom,
      calculationVersion: CALCULATION_VERSION,
      unitPricesApplied: [],
    };
  }
}
