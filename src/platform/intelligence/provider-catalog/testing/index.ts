/**
 * Provider Catalog testing helpers.
 */

import {
  createProviderCatalogPlatform,
  type CreateProviderCatalogOptions,
  type ProviderCatalogPlatform,
} from "../factories/create-provider-catalog-platform";
import { listCatalogProviderIds, countCatalogModels } from "../catalog/provider-catalog-seed";

export function deterministicHelpers() {
  let id = 0;
  let ms = 0;
  return {
    createId: (prefix: string) => `${prefix}_${++id}`,
    nowIso: () => "2026-07-14T00:00:00.000Z",
    clockMs: () => (ms += 2),
  };
}

export function setupProviderCatalog(
  options: CreateProviderCatalogOptions = {}
): ProviderCatalogPlatform {
  const helpers = deterministicHelpers();
  return createProviderCatalogPlatform({
    createId: helpers.createId,
    nowIso: helpers.nowIso,
    clockMs: helpers.clockMs,
    ...options,
  });
}

export function expectedCatalogProviderCount(): number {
  return listCatalogProviderIds().length;
}

export function expectedCatalogModelCount(): number {
  return countCatalogModels();
}
