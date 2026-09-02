/**
 * Catalog API — reads Official Provider Catalog public seed (no OS internals).
 */

import { success, type Result } from "../../core/result";
import {
  PROVIDER_CATALOG_SEED,
  listCatalogProviderIds,
} from "../../config/provider-catalog-seed";
import type { CapabilityResource, ProviderCatalogResource, ModelCatalogResource } from "../contracts";
import type { ICatalogApiService } from "../interfaces";

export class CatalogApiService implements ICatalogApiService {
  listCapabilities(): Result<readonly CapabilityResource[]> {
    const byCap = new Map<string, Set<string>>();
    for (const p of PROVIDER_CATALOG_SEED) {
      for (const m of p.models) {
        for (const cap of m.capabilities) {
          const id = `catalog.${p.department}.${slug(cap)}`;
          const set = byCap.get(id) ?? new Set();
          set.add(p.providerId);
          byCap.set(id, set);
        }
      }
    }
    return success(
      [...byCap.entries()].map(([capabilityId, providers]) => ({
        capabilityId,
        name: capabilityId.split(".").slice(-1)[0] ?? capabilityId,
        department: capabilityId.split(".")[1],
        supportedProviders: [...providers],
      }))
    );
  }

  listProviders(): Result<readonly ProviderCatalogResource[]> {
    return success(
      PROVIDER_CATALOG_SEED.map((p) => ({
        providerId: p.providerId,
        displayName: p.displayName,
        department: p.department,
        modelCount: p.models.length,
        status: p.existingLeaf ? "active_leaf" : "catalog_active",
      }))
    );
  }

  listModels(): Result<readonly ModelCatalogResource[]> {
    const rows: ModelCatalogResource[] = [];
    for (const p of PROVIDER_CATALOG_SEED) {
      for (const m of p.models) {
        rows.push({
          modelId: `${p.providerId}:${slug(m.modelLabel)}`,
          providerId: p.providerId,
          label: m.modelLabel,
        });
      }
    }
    return success(rows);
  }

  providerCount(): number {
    return listCatalogProviderIds().length;
  }
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
