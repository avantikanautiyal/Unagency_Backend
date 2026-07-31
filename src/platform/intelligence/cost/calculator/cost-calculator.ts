/**
 * M9.5Q — Provider-neutral cost calculator.
 * Never invents prices. Unknown → amount null.
 */

import {
  type CanonicalCostRecord,
  type CostComponent,
  type CostDimension,
  unknownCost,
} from "../contracts/cost-integrity";
import {
  normalizeUsage,
  usageHasInvalidNumbers,
  type NormalizedUsage,
} from "../contracts/normalized-usage";
import type {
  IProviderPricingCatalogue,
  ProviderPricingRecord,
} from "../contracts/pricing-catalogue";

export interface CostCalculateInput {
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityId: string;
  readonly usage?: Readonly<Record<string, unknown>> | NormalizedUsage | null;
  /** ISO time for historical catalogue lookup. */
  readonly atIso?: string;
  readonly nowIso?: string;
  /**
   * Explicit provider-reported monetary cost (vendor billing field).
   * Client-supplied spoof fields must NOT be passed here.
   */
  readonly providerReported?: {
    readonly amount: number;
    readonly currency: string;
  } | null;
  /** Reject client spoof attempts present on usage. */
  readonly rejectClientCostFields?: boolean;
}

const USAGE_DIM: Record<
  CostDimension,
  (u: NormalizedUsage) => number | null | undefined
> = {
  input_tokens: (u) => u.promptTokens,
  output_tokens: (u) => u.completionTokens,
  cached_input_tokens: (u) => u.cachedInputTokens,
  characters: (u) => u.characters,
  audio_seconds: (u) => u.audioSeconds,
  transcription_seconds: (u) => u.transcriptionSeconds,
  image: (u) => u.imagesGenerated,
  video_seconds: (u) => u.videoSeconds,
  compute_units: (u) => u.computeUnits,
  request: (u) => u.requests ?? 1,
};

export class CostCalculator {
  constructor(private readonly catalogue: IProviderPricingCatalogue) {}

  calculate(input: CostCalculateInput): CanonicalCostRecord {
    const nowIso = input.nowIso ?? new Date().toISOString();
    const base = {
      providerId: input.providerId,
      modelId: input.modelId,
      capabilityId: input.capabilityId,
      nowIso,
    };

    const rawUsage =
      input.usage && typeof input.usage === "object"
        ? (input.usage as Readonly<Record<string, unknown>>)
        : null;

    if (rawUsage && usageHasInvalidNumbers(rawUsage)) {
      return unknownCost({
        ...base,
        reason: "invalid_usage_numbers",
        usageSnapshot: null,
      });
    }

    // Client spoof: never trust cost/estimatedCost/currency from untrusted usage.
    if (input.rejectClientCostFields && rawUsage) {
      if (
        "clientCost" in rawUsage ||
        "clientPricePerToken" in rawUsage ||
        "spoofedCost" in rawUsage
      ) {
        // Continue calculating from catalogue; ignore spoof fields.
      }
    }

    if (
      input.providerReported &&
      Number.isFinite(input.providerReported.amount) &&
      input.providerReported.amount >= 0 &&
      input.providerReported.currency
    ) {
      const usageSnapshot = normalizeUsage(rawUsage);
      return {
        status: "calculated",
        method: "provider_reported",
        trust: "high",
        routingEligible: true,
        currency: input.providerReported.currency,
        amount: input.providerReported.amount,
        components: [],
        pricingVersion: null,
        providerId: input.providerId,
        modelId: input.modelId,
        capabilityId: input.capabilityId,
        usageSnapshot,
        calculatedAt: nowIso,
        provenance: "provider_reported",
      };
    }

    const usageSnapshot = normalizeUsage(rawUsage);
    if (!usageSnapshot) {
      return unknownCost({
        ...base,
        reason: "missing_usage",
        usageSnapshot: null,
      });
    }

    const pricing = this.catalogue.lookup({
      providerId: input.providerId,
      modelId: input.modelId,
      capabilityId: input.capabilityId,
      atIso: input.atIso ?? nowIso,
    });

    if (!pricing) {
      return unknownCost({
        ...base,
        reason: "pricing_unavailable",
        usageSnapshot,
      });
    }

    return this.fromPricing(pricing, usageSnapshot, nowIso);
  }

  private fromPricing(
    pricing: ProviderPricingRecord,
    usage: NormalizedUsage,
    nowIso: string
  ): CanonicalCostRecord {
    const components: CostComponent[] = [];
    let missingRequired = false;

    for (const rate of pricing.rates) {
      const qty = USAGE_DIM[rate.dimension](usage);
      if (qty == null) {
        // Required rate dimension missing → cannot claim full cost.
        missingRequired = true;
        continue;
      }
      if (rate.unitSize <= 0 || !Number.isFinite(rate.unitPrice)) {
        return unknownCost({
          providerId: pricing.providerId,
          modelId: pricing.modelId,
          capabilityId: pricing.capabilityId,
          reason: "invalid_pricing_rate",
          nowIso,
          usageSnapshot: usage,
        });
      }
      const amount = (qty / rate.unitSize) * rate.unitPrice;
      if (!Number.isFinite(amount) || amount < 0) {
        return unknownCost({
          providerId: pricing.providerId,
          modelId: pricing.modelId,
          capabilityId: pricing.capabilityId,
          reason: "non_finite_component_amount",
          nowIso,
          usageSnapshot: usage,
        });
      }
      components.push({
        dimension: rate.dimension,
        quantity: qty,
        unitSize: rate.unitSize,
        unitPrice: rate.unitPrice,
        amount,
      });
    }

    if (components.length === 0) {
      return unknownCost({
        providerId: pricing.providerId,
        modelId: pricing.modelId,
        capabilityId: pricing.capabilityId,
        reason: missingRequired ? "partial_usage_incomplete" : "no_applicable_rates",
        nowIso,
        usageSnapshot: usage,
      });
    }

    const amount = components.reduce((s, c) => s + c.amount, 0);
    const partial = missingRequired;
    const routingOk =
      !partial &&
      pricing.routingEligible &&
      pricing.provenance !== "inventory_seed_unverified" &&
      (pricing.trust === "high" || pricing.trust === "medium");

    return {
      status: partial ? "partially_calculated" : "calculated",
      method: "pricing_catalogue",
      trust: partial ? "low" : pricing.trust,
      routingEligible: routingOk,
      currency: pricing.currency,
      amount: partial ? null : amount,
      components,
      pricingVersion: pricing.pricingVersion,
      pricingEffectiveAt: pricing.effectiveFrom,
      providerId: pricing.providerId,
      modelId: pricing.modelId,
      capabilityId: pricing.capabilityId,
      usageSnapshot: usage,
      calculatedAt: nowIso,
      provenance: pricing.provenance,
      exclusionReason: partial
        ? "partial_usage_cannot_masquerade_as_total"
        : pricing.routingEligible
          ? undefined
          : "pricing_not_routing_eligible",
    };
  }
}
