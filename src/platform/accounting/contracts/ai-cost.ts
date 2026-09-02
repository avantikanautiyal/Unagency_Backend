/**
 * Cost calculation result contracts.
 */

import type { AICostStatus } from "./enums";
import type { PricingUnit } from "./enums";

export interface AppliedUnitPrice {
  readonly unit: PricingUnit | string;
  readonly pricePerUnit: string;
  readonly quantity: number;
  readonly costUsd: string;
}

export interface AICostBreakdown {
  readonly estimatedInputCostUsd: string | null;
  readonly estimatedOutputCostUsd: string | null;
  readonly estimatedCachedCostUsd: string | null;
  readonly estimatedReasoningCostUsd: string | null;
  readonly estimatedOtherCostUsd: string | null;
  readonly estimatedTotalCostUsd: string | null;
  readonly originalCurrency: string;
  readonly originalAmount: string | null;
  readonly reportingCurrency: string;
  readonly reportingAmountUsd: string | null;
  readonly exchangeRate: string | null;
  readonly exchangeRateVersion: string | null;
  readonly exchangeRateTimestamp: string | null;
  readonly costStatus: AICostStatus;
  readonly pricingVersion: string | null;
  readonly pricingEffectiveAt: string | null;
  readonly calculationVersion: string;
  readonly unitPricesApplied: readonly AppliedUnitPrice[];
}

export const CALCULATION_VERSION = "1.0.0" as const;
