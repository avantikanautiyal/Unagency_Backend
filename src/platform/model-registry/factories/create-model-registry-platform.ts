/**
 * Model Registry platform factory.
 */

import { DefaultCompatibilityEngine } from "../compatibility/default-compatibility-engine";
import { DefaultModelDiscoveryEngine } from "../discovery/default-discovery-engine";
import { loadSeedInventory } from "../discovery/seed-loader";
import { ModelRegistryEngine } from "../engine/model-registry-engine";
import { DefaultModelLifecycleManager } from "../lifecycle/default-lifecycle-manager";
import { DefaultLimitsEngine } from "../limits/default-limits-engine";
import { InMemoryModelRegistryStore } from "../models/in-memory-model-registry";
import { DefaultPricingEngine } from "../pricing/default-pricing-engine";
import { InMemoryProviderManifestRegistry } from "../providers/in-memory-provider-manifest-registry";
import { DefaultRegionEngine } from "../regions/default-region-engine";
import { DefaultModelSearchEngine } from "../search/default-search-engine";
import { DefaultModelValidationEngine } from "../validation/default-validation-engine";
import type {
  IModelDiscoveryEngine,
  IModelRegistry,
  IModelSearchEngine,
  IModelValidationEngine,
  IPricingEngine,
} from "../interfaces/model-registry";

export interface ModelRegistryPlatform {
  readonly registry: IModelRegistry;
  readonly discovery: IModelDiscoveryEngine;
  readonly search: IModelSearchEngine;
  readonly validation: IModelValidationEngine;
  readonly pricing: IPricingEngine;
}

export interface CreateModelRegistryPlatformOptions {
  readonly loadSeed?: boolean;
  readonly nowIso?: () => string;
  readonly createId?: (prefix: string) => string;
}

export function createModelRegistryPlatform(
  options: CreateModelRegistryPlatformOptions = {}
): ModelRegistryPlatform {
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  const store = new InMemoryModelRegistryStore();
  const providerManifests = new InMemoryProviderManifestRegistry(store);
  const validation = new DefaultModelValidationEngine(store);
  const discovery = new DefaultModelDiscoveryEngine(store, nowIso);
  const search = new DefaultModelSearchEngine(store);
  const compatibility = new DefaultCompatibilityEngine();
  const lifecycle = new DefaultModelLifecycleManager(store);
  const pricing = new DefaultPricingEngine();
  const limits = new DefaultLimitsEngine(store);
  const regions = new DefaultRegionEngine(store);

  if (options.loadSeed !== false) {
    const loaded = loadSeedInventory(store, nowIso);
    if (!loaded.ok) throw loaded.error;
  }

  const registry = new ModelRegistryEngine({
    store,
    providerManifests,
    discovery,
    search,
    validation,
    compatibility,
    lifecycle,
    pricing,
    limits,
    regions,
    nowIso,
    createId: options.createId,
  });

  return { registry, discovery, search, validation, pricing };
}
