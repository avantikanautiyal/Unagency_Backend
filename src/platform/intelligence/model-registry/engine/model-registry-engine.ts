/**
 * Model Registry engine — public facade.
 */

import { failure, success, type Result } from "../../shared/result";
import { ValidationError } from "../../shared/errors";
import { asModelSnapshotId } from "../contracts/identifiers";
import type { CanonicalModel, ModelManifest } from "../contracts/model";
import type { CanonicalProvider, ProviderManifest } from "../contracts/provider";
import type { ModelSnapshot, ModelStatistics } from "../contracts/statistics";
import type { ProviderId } from "../../shared/identifiers";
import type {
  ICompatibilityEngine,
  ILimitsEngine,
  IModelDiscoveryEngine,
  IModelLifecycleManager,
  IModelRegistry,
  IModelSearchEngine,
  IModelValidationEngine,
  IPricingEngine,
  IProviderManifestRegistry,
  IRegionEngine,
} from "../interfaces/model-registry";
import type { InMemoryModelRegistryStore } from "../models/in-memory-model-registry";

export interface ModelRegistryEngineDeps {
  readonly store: InMemoryModelRegistryStore;
  readonly providerManifests: IProviderManifestRegistry;
  readonly discovery: IModelDiscoveryEngine;
  readonly search: IModelSearchEngine;
  readonly validation: IModelValidationEngine;
  readonly compatibility: ICompatibilityEngine;
  readonly lifecycle: IModelLifecycleManager;
  readonly pricing: IPricingEngine;
  readonly limits: ILimitsEngine;
  readonly regions: IRegionEngine;
  readonly nowIso?: () => string;
  readonly createId?: (prefix: string) => string;
}

export class ModelRegistryEngine implements IModelRegistry {
  private readonly nowIso: () => string;
  private readonly createId: (prefix: string) => string;

  constructor(private readonly deps: ModelRegistryEngineDeps) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.createId = deps.createId ?? ((p) => `${p}_${Math.random().toString(36).slice(2)}`);
  }

  registerProvider(manifest: ProviderManifest): Result<CanonicalProvider> {
    const issues = this.deps.validation.validateProvider(manifest);
    if (!issues.ok) return issues;
    if (issues.value.length > 0) {
      return failure(new ValidationError(issues.value.join("; ")));
    }
    const reg = this.deps.providerManifests.register(manifest);
    if (!reg.ok) return reg;
    return success(manifest.provider);
  }

  registerModel(manifest: ModelManifest): Result<CanonicalModel> {
    const issues = this.deps.validation.validateModel(manifest);
    if (!issues.ok) return issues;
    if (issues.value.length > 0) {
      return failure(new ValidationError(issues.value.join("; ")));
    }
    const reg = this.deps.store.registerModelManifest(manifest);
    if (!reg.ok) return reg;
    return success(manifest.model);
  }

  getProvider(providerId: ProviderId): Result<CanonicalProvider> {
    return this.deps.store.getProvider(providerId);
  }

  getModel(modelId: string): Result<CanonicalModel> {
    return this.deps.store.getModel(modelId);
  }

  listProviders(): Result<readonly CanonicalProvider[]> {
    return success(this.deps.store.listProviders());
  }

  listModels(providerId?: ProviderId): Result<readonly CanonicalModel[]> {
    return success(this.deps.store.listModels(providerId));
  }

  snapshot(): Result<ModelSnapshot> {
    const stats = this.statistics();
    if (!stats.ok) return stats;
    return success({
      snapshotId: asModelSnapshotId(this.createId("model_snap")),
      providers: this.deps.store.listProviders(),
      models: this.deps.store.allModels(),
      statistics: stats.value,
      capturedAt: this.nowIso(),
    });
  }

  statistics(): Result<ModelStatistics> {
    const models = this.deps.store.allModels();
    const providers = this.deps.store.listProviders();
    const modalityCounts: Record<string, number> = {};
    const providerCounts: Record<string, number> = {};
    const capabilityCounts: Record<string, number> = {};

    for (const m of models) {
      providerCounts[String(m.providerId)] = (providerCounts[String(m.providerId)] ?? 0) + 1;
      for (const mod of m.modalities) {
        modalityCounts[mod] = (modalityCounts[mod] ?? 0) + 1;
      }
      for (const c of m.capabilities) {
        capabilityCounts[c.capabilityId] = (capabilityCounts[c.capabilityId] ?? 0) + 1;
      }
    }

    return success({
      totalProviders: providers.length,
      totalModels: models.length,
      activeModels: models.filter((m) => m.lifecycle.state === "active").length,
      deprecatedModels: models.filter((m) => m.lifecycle.state === "deprecated").length,
      modalityCounts,
      providerCounts,
      capabilityCounts,
      computedAt: this.nowIso(),
    });
  }
}
