/**
 * Converts inventory-seed pricing into explicit per-unit accounting rates.
 */

import {
  providerIdForVendor,
  SEED_MODELS,
  type SeedModelEntry,
} from "../../model-registry/discovery/inventory-seed";
import type { AIModelPricingRecord, PricingUnitRate } from "../contracts/ai-model-pricing";
import { PRICING_UNIT } from "../contracts/enums";

const PRICING_VERSION = "seed-v1";
const EFFECTIVE_FROM = "2024-01-01T00:00:00.000Z";

function isMediaModel(entry: SeedModelEntry): boolean {
  return (
    entry.modalities.includes("image") ||
    entry.modalities.includes("video") ||
    entry.modalities.includes("audio")
  );
}

function seedRatesForModel(entry: SeedModelEntry): {
  readonly unitRates: PricingUnitRate[];
  readonly requiresConfiguration: boolean;
} {
  const unitRates: PricingUnitRate[] = [];

  if (entry.modalities.includes("video")) {
    return { unitRates: [], requiresConfiguration: true };
  }

  if (entry.capabilities.some((c) => c.includes("research"))) {
    if (entry.inputPer1k <= 0 && entry.outputPer1k <= 0) {
      return { unitRates: [], requiresConfiguration: true };
    }
  }

  if (entry.modalities.includes("image")) {
    if (entry.inputPer1k > 0) {
      unitRates.push({
        unit: PRICING_UNIT.IMAGE,
        pricePerUnit: String(entry.inputPer1k),
        currency: "USD",
      });
    }
    return {
      unitRates,
      requiresConfiguration: unitRates.length === 0,
    };
  }

  if (entry.modalities.includes("audio")) {
    if (entry.outputPer1k > 0) {
      unitRates.push({
        unit: PRICING_UNIT.AUDIO_CHARACTER,
        pricePerUnit: String(entry.outputPer1k),
        currency: "USD",
      });
    }
    if (entry.inputPer1k > 0) {
      unitRates.push({
        unit: PRICING_UNIT.AUDIO_SECOND,
        pricePerUnit: String(entry.inputPer1k),
        currency: "USD",
      });
    }
    return {
      unitRates,
      requiresConfiguration: unitRates.length === 0,
    };
  }

  if (entry.capabilities.includes("embedding.generate")) {
    if (entry.inputPer1k > 0 || entry.outputPer1k > 0) {
      unitRates.push({
        unit: PRICING_UNIT.EMBEDDING_TOKEN_PER_1M,
        pricePerUnit: String(entry.inputPer1k > 0 ? entry.inputPer1k : entry.outputPer1k),
        currency: "USD",
      });
      return { unitRates, requiresConfiguration: false };
    }
    return { unitRates: [], requiresConfiguration: true };
  }

  const input = entry.inputPer1k;
  const output = entry.outputPer1k;

  if (input <= 0 && output <= 0) {
    return { unitRates: [], requiresConfiguration: true };
  }

  if (!isMediaModel(entry) && (input >= 0.05 || output >= 0.05)) {
    if (input > 0) {
      unitRates.push({
        unit: PRICING_UNIT.TOKEN_INPUT_PER_1M,
        pricePerUnit: String(input),
        currency: "USD",
      });
    }
    if (output > 0) {
      unitRates.push({
        unit: PRICING_UNIT.TOKEN_OUTPUT_PER_1M,
        pricePerUnit: String(output),
        currency: "USD",
      });
    }
    return { unitRates, requiresConfiguration: false };
  }

  if (input > 0) {
    unitRates.push({
      unit: PRICING_UNIT.TOKEN_INPUT_PER_1M,
      pricePerUnit: String(input * 1000),
      currency: "USD",
    });
  }
  if (output > 0) {
    unitRates.push({
      unit: PRICING_UNIT.TOKEN_OUTPUT_PER_1M,
      pricePerUnit: String(output * 1000),
      currency: "USD",
    });
  }

  return {
    unitRates,
    requiresConfiguration: unitRates.length === 0,
  };
}

export function buildPricingRecordsFromSeed(nowIso: string): AIModelPricingRecord[] {
  return SEED_MODELS.map((entry) => {
    const providerId = providerIdForVendor(entry.providerVendor);
    const modelId = entry.modelId;
    const { unitRates, requiresConfiguration } = seedRatesForModel(entry);

    return {
      pricingId: `pricing_${entry.providerVendor}_${entry.modelId}_${PRICING_VERSION}`,
      providerId: String(providerId),
      modelId,
      pricingVersion: PRICING_VERSION,
      effectiveFrom: EFFECTIVE_FROM,
      effectiveTo: null,
      unitRates,
      currency: "USD",
      active: true,
      requiresConfiguration,
      source: "inventory-seed",
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  });
}
