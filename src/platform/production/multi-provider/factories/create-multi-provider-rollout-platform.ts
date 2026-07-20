/**
 * Multi-Provider Production Rollout factory.
 */

import {
  createProviderCatalogPlatform,
  type ProviderCatalogPlatform,
  type CreateProviderCatalogOptions,
} from "../../../intelligence/provider-catalog/factories/create-provider-catalog-platform";
import {
  createObservabilityPlatform,
  type ObservabilityPlatform,
} from "../../../infrastructure/observability/factories/create-observability-platform";
import {
  MultiProviderRolloutEngine,
  type MultiProviderRolloutEngineDeps,
} from "../engine/multi-provider-rollout-engine";
import type { IMultiProviderRolloutEngine } from "../interfaces";
import { InMemoryBenchmarkEvidenceStore } from "../evidence/evidence-store";

export interface MultiProviderRolloutPlatform {
  readonly engine: IMultiProviderRolloutEngine;
  readonly catalog: ProviderCatalogPlatform;
  readonly observability: ObservabilityPlatform;
  readonly evidenceStore: InMemoryBenchmarkEvidenceStore;
}

export interface CreateMultiProviderRolloutOptions
  extends CreateProviderCatalogOptions {
  readonly observability?: ObservabilityPlatform;
  readonly evidenceStore?: InMemoryBenchmarkEvidenceStore;
  readonly productionValidationAttached?: boolean;
  readonly publishObservability?: boolean;
}

export function createMultiProviderRolloutPlatform(
  options: CreateMultiProviderRolloutOptions = {}
): MultiProviderRolloutPlatform {
  const catalog = createProviderCatalogPlatform(options);
  const observability =
    options.observability ??
    createObservabilityPlatform({
      nowIso: options.nowIso,
      clockMs: options.clockMs,
      createId: options.createId,
    });
  const evidenceStore = options.evidenceStore ?? new InMemoryBenchmarkEvidenceStore();

  const deps: MultiProviderRolloutEngineDeps = {
    catalog: catalog.engine,
    evidenceStore,
    observability: observability.engine,
    nowIso: options.nowIso,
    clockMs: options.clockMs,
    createId: options.createId,
    productionValidationAttached: options.productionValidationAttached ?? true,
  };

  const engine = new MultiProviderRolloutEngine(deps);
  return { engine, catalog, observability, evidenceStore };
}
