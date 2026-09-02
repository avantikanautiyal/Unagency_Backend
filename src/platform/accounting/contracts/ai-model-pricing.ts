/**
 * Versioned model pricing registry contracts.
 */

import type { PricingUnit } from "./enums";

export interface PricingUnitRate {
  readonly unit: PricingUnit | string;
  readonly pricePerUnit: string;
  readonly currency: string;
}

export interface AIModelPricingRecord {
  readonly pricingId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly pricingVersion: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly unitRates: readonly PricingUnitRate[];
  readonly currency: string;
  readonly active: boolean;
  readonly requiresConfiguration: boolean;
  readonly source: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PricingLookupResult {
  readonly record: AIModelPricingRecord | null;
  readonly reason: "found" | "not_found" | "requires_configuration" | "expired";
}
