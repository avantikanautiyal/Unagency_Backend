/**
 * Provider Catalog Platform factory.
 */

import { createProviderGeneratorPlatform } from "../../provider-generator/factories/create-provider-generator-platform";
import { createProviderMeshPlatform } from "../../provider-mesh/factories/create-provider-mesh-platform";
import { InMemoryCapabilityRegistry } from "../../capability-intelligence/registry/in-memory-capability-registry";
import { CAPABILITY_TAXONOMY_SEED } from "../../capability-intelligence/taxonomy/capability-taxonomy";
import type { ICapabilityRegistry } from "../../capability-intelligence/interfaces/capability-intelligence";
import type { IProviderMeshEngine } from "../../provider-mesh/interfaces/mesh";
import type { IProviderGeneratorEngine } from "../../provider-generator/interfaces/generator";
import { CatalogIntegrationEngine } from "../integration/catalog-integration-engine";

export interface ProviderCatalogPlatform {
  readonly engine: CatalogIntegrationEngine;
  readonly generator: IProviderGeneratorEngine;
  readonly mesh: IProviderMeshEngine;
  readonly capabilityRegistry: ICapabilityRegistry;
}

export interface CreateProviderCatalogOptions {
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
  readonly mesh?: IProviderMeshEngine;
  readonly capabilityRegistry?: ICapabilityRegistry;
  readonly generator?: IProviderGeneratorEngine;
}

export function createProviderCatalogPlatform(
  options: CreateProviderCatalogOptions = {}
): ProviderCatalogPlatform {
  const generator =
    options.generator ??
    createProviderGeneratorPlatform({
      nowIso: options.nowIso,
      clockMs: options.clockMs,
      createId: options.createId,
    }).engine;

  const mesh =
    options.mesh ??
    createProviderMeshPlatform({
      nowIso: options.nowIso,
      clockMs: options.clockMs,
      createId: options.createId,
    }).engine;

  const capabilityRegistry =
    options.capabilityRegistry ??
    new InMemoryCapabilityRegistry(CAPABILITY_TAXONOMY_SEED);

  const engine = new CatalogIntegrationEngine({
    generator,
    targets: { mesh, capabilityRegistry },
    nowIso: options.nowIso,
    clockMs: options.clockMs,
  });

  return { engine, generator, mesh, capabilityRegistry };
}
