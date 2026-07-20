/**
 * Model discovery engine.
 */

import { failure, success, type Result } from "../../shared/result";
import { NotFoundError } from "../../shared/errors";
import type { ProviderId } from "../../shared/identifiers";
import type { ModelDiscoveryResult } from "../contracts/search";
import type { IModelDiscoveryEngine } from "../interfaces/model-registry";
import type { InMemoryModelRegistryStore } from "../models/in-memory-model-registry";

export class DefaultModelDiscoveryEngine implements IModelDiscoveryEngine {
  constructor(
    private readonly store: InMemoryModelRegistryStore,
    private readonly nowIso: () => string = () => new Date().toISOString()
  ) {}

  discoverAll(): Result<ModelDiscoveryResult> {
    const providers = this.store.listProviders();
    const models = this.store.allModels();
    return success({
      providers,
      models,
      capabilities: this.store.allCapabilities(),
      discoveredAt: this.nowIso(),
      totalProviders: providers.length,
      totalModels: models.length,
    });
  }

  discoverProvider(providerId: ProviderId): Result<ModelDiscoveryResult> {
    const provider = this.store.getProvider(providerId);
    if (!provider.ok) return provider;
    const models = this.store.listModels(providerId);
    const caps = new Set<string>();
    for (const m of models) {
      for (const c of m.capabilities) caps.add(c.capabilityId);
    }
    return success({
      providers: [provider.value],
      models,
      capabilities: [...caps],
      discoveredAt: this.nowIso(),
      totalProviders: 1,
      totalModels: models.length,
    });
  }

  listCapabilities(): Result<readonly string[]> {
    return success(this.store.allCapabilities());
  }
}
