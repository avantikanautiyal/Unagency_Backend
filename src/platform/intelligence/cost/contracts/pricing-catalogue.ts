/**
 * M9.5Q — Versioned provider pricing catalogue.
 * Only explicitly verified / fixture records — never scraped or guessed live prices.
 */

import type { CostDimension } from "./cost-integrity";

export type PricingProvenance =
  | "test_fixture"
  | "manual_verified"
  | "contract_rate"
  | "inventory_seed_unverified";

export interface PricingRate {
  readonly dimension: CostDimension;
  /** Price per `unitSize` of the dimension (e.g. 1000 tokens). */
  readonly unitPrice: number;
  readonly unitSize: number;
}

export interface ProviderPricingRecord {
  readonly pricingVersion: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityId: string;
  readonly currency: string;
  readonly rates: readonly PricingRate[];
  readonly effectiveFrom: string;
  readonly effectiveTo?: string | null;
  readonly provenance: PricingProvenance;
  /**
   * Only verified / contract / test_fixture may be routingEligible when calculated.
   * inventory_seed_unverified must never drive economic routing.
   */
  readonly routingEligible: boolean;
  readonly trust: "high" | "medium" | "low" | "none";
  readonly sourceNote?: string;
}

export interface PricingLookupKey {
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityId: string;
  /** ISO time for historical price resolution. */
  readonly atIso?: string;
}

export interface IProviderPricingCatalogue {
  upsert(record: ProviderPricingRecord): void;
  /**
   * Resolve pricing effective at `atIso` (default now).
   * Exact provider+model+capability match only — no silent alias guessing.
   */
  lookup(key: PricingLookupKey): ProviderPricingRecord | undefined;
  list(): readonly ProviderPricingRecord[];
  count(): number;
}

export class InMemoryProviderPricingCatalogue implements IProviderPricingCatalogue {
  private readonly records: ProviderPricingRecord[] = [];

  upsert(record: ProviderPricingRecord): void {
    const idx = this.records.findIndex(
      (r) =>
        r.pricingVersion === record.pricingVersion &&
        r.providerId === record.providerId &&
        r.modelId === record.modelId &&
        r.capabilityId === record.capabilityId
    );
    if (idx >= 0) this.records[idx] = record;
    else this.records.push(record);
  }

  lookup(key: PricingLookupKey): ProviderPricingRecord | undefined {
    const at = Date.parse(key.atIso ?? new Date().toISOString());
    const matches = this.records.filter(
      (r) =>
        r.providerId === key.providerId &&
        r.modelId === key.modelId &&
        r.capabilityId === key.capabilityId &&
        Date.parse(r.effectiveFrom) <= at &&
        (r.effectiveTo == null || Date.parse(r.effectiveTo) > at)
    );
    if (matches.length === 0) return undefined;
    // Prefer highest effectiveFrom (most recent version in window).
    return matches.sort(
      (a, b) => Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom)
    )[0];
  }

  list(): readonly ProviderPricingRecord[] {
    return [...this.records];
  }

  count(): number {
    return this.records.length;
  }
}

/**
 * Synthetic TEST fixtures only — not vendor list prices.
 * Used for offline certification of Cost Intelligence.
 */
export function seedTestPricingFixtures(
  catalogue: IProviderPricingCatalogue
): void {
  catalogue.upsert({
    pricingVersion: "TEST_PRICE_V1",
    providerId: "provider.test_a",
    modelId: "model-a",
    capabilityId: "text.generate",
    currency: "USD",
    rates: [
      { dimension: "input_tokens", unitPrice: 0.001, unitSize: 1000 },
      { dimension: "output_tokens", unitPrice: 0.002, unitSize: 1000 },
    ],
    effectiveFrom: "2020-01-01T00:00:00.000Z",
    effectiveTo: "2025-06-01T00:00:00.000Z",
    provenance: "test_fixture",
    routingEligible: true,
    trust: "high",
    sourceNote: "Synthetic fixture V1 — not vendor pricing",
  });
  catalogue.upsert({
    pricingVersion: "TEST_PRICE_V2",
    providerId: "provider.test_a",
    modelId: "model-a",
    capabilityId: "text.generate",
    currency: "USD",
    rates: [
      { dimension: "input_tokens", unitPrice: 0.01, unitSize: 1000 },
      { dimension: "output_tokens", unitPrice: 0.02, unitSize: 1000 },
    ],
    effectiveFrom: "2025-06-01T00:00:00.000Z",
    provenance: "test_fixture",
    routingEligible: true,
    trust: "high",
    sourceNote: "Synthetic fixture V2 — not vendor pricing",
  });
  catalogue.upsert({
    pricingVersion: "TEST_EMBED_V1",
    providerId: "provider.test_embed",
    modelId: "embed-a",
    capabilityId: "embedding.generate",
    currency: "USD",
    rates: [{ dimension: "input_tokens", unitPrice: 0.0001, unitSize: 1000 }],
    effectiveFrom: "2020-01-01T00:00:00.000Z",
    provenance: "test_fixture",
    routingEligible: true,
    trust: "high",
    sourceNote: "Synthetic embedding fixture",
  });
  catalogue.upsert({
    pricingVersion: "TEST_TTS_V1",
    providerId: "provider.test_tts",
    modelId: "tts-a",
    capabilityId: "audio.synthesize",
    currency: "USD",
    rates: [{ dimension: "characters", unitPrice: 0.000015, unitSize: 1 }],
    effectiveFrom: "2020-01-01T00:00:00.000Z",
    provenance: "test_fixture",
    routingEligible: true,
    trust: "high",
    sourceNote: "Synthetic TTS character fixture",
  });
  catalogue.upsert({
    pricingVersion: "TEST_VIDEO_V1",
    providerId: "provider.test_video",
    modelId: "video-a",
    capabilityId: "video.generate",
    currency: "USD",
    rates: [{ dimension: "video_seconds", unitPrice: 0.05, unitSize: 1 }],
    effectiveFrom: "2020-01-01T00:00:00.000Z",
    provenance: "test_fixture",
    routingEligible: true,
    trust: "high",
    sourceNote: "Synthetic video-seconds fixture",
  });
  catalogue.upsert({
    pricingVersion: "TEST_EUR_V1",
    providerId: "provider.test_eur",
    modelId: "model-eur",
    capabilityId: "text.generate",
    currency: "EUR",
    rates: [
      { dimension: "input_tokens", unitPrice: 0.001, unitSize: 1000 },
      { dimension: "output_tokens", unitPrice: 0.002, unitSize: 1000 },
    ],
    effectiveFrom: "2020-01-01T00:00:00.000Z",
    provenance: "test_fixture",
    routingEligible: true,
    trust: "high",
    sourceNote: "Synthetic EUR fixture for cross-currency tests",
  });
}
