/**
 * Model pricing contracts.
 */

import type { PricingUnit } from "./enums";

export interface ModelPricingTier {
  readonly unit: PricingUnit;
  readonly amount: number;
  readonly currency: string;
}

export interface ModelPricing {
  readonly inputPer1kTokens?: number;
  readonly outputPer1kTokens?: number;
  readonly perRequest?: number;
  readonly perImage?: number;
  readonly perMinute?: number;
  readonly currency: string;
  readonly tiers?: readonly ModelPricingTier[];
}
