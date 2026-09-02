/**
 * Model search engine.
 */

import { success, type Result } from "../../core/result";
import type { CanonicalModel } from "../contracts/model";
import type { ModelSearchRequest, ModelSearchResult } from "../contracts/search";
import type { IModelSearchEngine } from "../interfaces/model-registry";
import type { InMemoryModelRegistryStore } from "../models/in-memory-model-registry";

export class DefaultModelSearchEngine implements IModelSearchEngine {
  constructor(private readonly store: InMemoryModelRegistryStore) {}

  search(request: ModelSearchRequest): Result<ModelSearchResult> {
    let models = this.store.allModels();

    if (request.providerId) {
      models = models.filter((m) => String(m.providerId) === String(request.providerId));
    }
    if (request.department) {
      models = models.filter((m) => m.departments.includes(request.department!));
    }
    if (request.capability) {
      models = models.filter((m) =>
        m.capabilities.some((c) => c.capabilityId === request.capability)
      );
    }
    if (request.modality) {
      models = models.filter((m) => m.modalities.includes(request.modality!));
    }
    if (request.latencyTier) {
      models = models.filter((m) => m.latencyTier === request.latencyTier);
    }
    if (request.qualityTier) {
      models = models.filter((m) => m.qualityTier === request.qualityTier);
    }
    if (request.maxInputCostPer1k !== undefined) {
      models = models.filter(
        (m) => (m.pricing.inputPer1kTokens ?? Infinity) <= request.maxInputCostPer1k!
      );
    }
    if (request.region) {
      models = models.filter((m) =>
        m.regions.some((r) => r.regionId === request.region)
      );
    }
    if (request.lifecycle) {
      models = models.filter((m) => m.lifecycle.state === request.lifecycle);
    }
    if (request.availability) {
      models = models.filter((m) => m.availability === request.availability);
    }
    if (request.query?.trim()) {
      const q = request.query.toLowerCase();
      models = models.filter(
        (m) =>
          m.displayName.toLowerCase().includes(q) ||
          String(m.modelId).toLowerCase().includes(q) ||
          m.aliases?.some((a) => a.toLowerCase().includes(q))
      );
    }

    models = sortModels(models);
    const total = models.length;
    const offset = request.offset ?? 0;
    const limit = request.limit ?? 50;
    const page = models.slice(offset, offset + limit);

    return success({ models: page, total, limit, offset, query: request.query });
  }

  searchCapabilities(query?: string): Result<readonly string[]> {
    let caps = this.store.allCapabilities();
    if (query?.trim()) {
      const q = query.toLowerCase();
      caps = caps.filter((c) => c.toLowerCase().includes(q));
    }
    return success(caps);
  }
}

function sortModels(models: CanonicalModel[]): CanonicalModel[] {
  return [...models].sort((a, b) => {
    const q = qualityRank(b.qualityTier) - qualityRank(a.qualityTier);
    if (q !== 0) return q;
    return (a.pricing.inputPer1kTokens ?? 0) - (b.pricing.inputPer1kTokens ?? 0);
  });
}

function qualityRank(tier: string): number {
  return { frontier: 4, premium: 3, standard: 2, economy: 1 }[tier] ?? 0;
}
