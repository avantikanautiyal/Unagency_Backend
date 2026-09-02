/**
 * Versioned model pricing registry.
 */

import type {
  AIModelPricingRecord,
  PricingLookupResult,
  PricingUnitRate,
} from "../contracts/ai-model-pricing";
import { buildPricingRecordsFromSeed } from "./pricing-seed-loader";

export interface IPricingRegistry {
  lookup(
    providerId: string,
    modelId: string,
    asOf: string
  ): PricingLookupResult;
  listActive(): readonly AIModelPricingRecord[];
}

export class InMemoryPricingRegistry implements IPricingRegistry {
  private readonly records: readonly AIModelPricingRecord[];

  constructor(records: readonly AIModelPricingRecord[]) {
    this.records = records;
  }

  static fromSeed(nowIso: string = new Date().toISOString()): InMemoryPricingRegistry {
    return new InMemoryPricingRegistry(buildPricingRecordsFromSeed(nowIso));
  }

  lookup(providerId: string, modelId: string, asOf: string): PricingLookupResult {
    const asOfMs = Date.parse(asOf);
    const candidates = this.records.filter((record) => {
      if (record.providerId !== providerId || !record.active) return false;
      if (!modelMatches(record.modelId, modelId)) return false;
      const fromMs = Date.parse(record.effectiveFrom);
      const toMs = record.effectiveTo ? Date.parse(record.effectiveTo) : Number.POSITIVE_INFINITY;
      return asOfMs >= fromMs && asOfMs < toMs;
    });

    if (candidates.length === 0) {
      return { record: null, reason: "not_found" };
    }

    const record = candidates.sort((a, b) =>
      Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom)
    )[0];

    if (record.requiresConfiguration || record.unitRates.length === 0) {
      return { record, reason: "requires_configuration" };
    }

    return { record, reason: "found" };
  }

  listActive(): readonly AIModelPricingRecord[] {
    return this.records.filter((r) => r.active);
  }

  findUnitRate(
    providerId: string,
    modelId: string,
    asOf: string,
    unit: string
  ): PricingUnitRate | null {
    const lookup = this.lookup(providerId, modelId, asOf);
    if (!lookup.record) return null;
    return lookup.record.unitRates.find((rate) => rate.unit === unit) ?? null;
  }
}

function modelMatches(registryModelId: string, requestedModelId: string): boolean {
  const a = registryModelId.trim().toLowerCase();
  const b = requestedModelId.trim().toLowerCase();
  if (a === b) return true;
  if (b.endsWith(`/${a}`)) return true;
  if (a.endsWith(`/${b}`)) return true;
  const aTail = a.split("/").pop() ?? a;
  const bTail = b.split("/").pop() ?? b;
  return aTail === bTail;
}

let defaultRegistry: InMemoryPricingRegistry | null = null;

export function getDefaultPricingRegistry(): InMemoryPricingRegistry {
  if (!defaultRegistry) {
    defaultRegistry = InMemoryPricingRegistry.fromSeed();
  }
  return defaultRegistry;
}

export function setDefaultPricingRegistry(registry: InMemoryPricingRegistry): void {
  defaultRegistry = registry;
}
