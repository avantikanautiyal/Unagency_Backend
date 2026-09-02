/**
 * Seed loader — registers inventory seed data into the store.
 */

import { failure, success, type Result } from "../../core/result";
import { ValidationError } from "../../core/errors";
import {
  buildModelManifest,
  buildProviderManifest,
} from "../builders/manifest-builders";
import {
  providerIdForVendor,
  SEED_MODELS,
  SEED_PROVIDERS,
} from "../discovery/inventory-seed";
import type { InMemoryModelRegistryStore } from "../models/in-memory-model-registry";
import { DefaultModelValidationEngine } from "../validation/default-validation-engine";

export function loadSeedInventory(
  store: InMemoryModelRegistryStore,
  nowIso: () => string = () => new Date().toISOString()
): Result<{ providers: number; models: number }> {
  const validator = new DefaultModelValidationEngine(store);
  const now = nowIso();
  const modelsByVendor = new Map<string, string[]>();

  for (const entry of SEED_MODELS) {
    const list = modelsByVendor.get(entry.providerVendor) ?? [];
    list.push(entry.modelId);
    modelsByVendor.set(entry.providerVendor, list);
  }

  for (const entry of SEED_PROVIDERS) {
    const modelIds = modelsByVendor.get(entry.vendor) ?? [];
    const manifest = buildProviderManifest(entry, modelIds, now);
    const issues = validator.validateProvider(manifest);
    if (!issues.ok) return issues;
    if (issues.value.length > 0) {
      return failure(new ValidationError(issues.value.join("; ")));
    }
    const reg = store.registerProviderManifest(manifest);
    if (!reg.ok) return reg;
  }

  for (const entry of SEED_MODELS) {
    const providerId = providerIdForVendor(entry.providerVendor);
    const manifest = buildModelManifest(entry, providerId, now);
    const issues = validator.validateModel(manifest);
    if (!issues.ok) return issues;
    if (issues.value.length > 0) {
      return failure(new ValidationError(issues.value.join("; ")));
    }
    const reg = store.registerModelManifest(manifest);
    if (!reg.ok) return reg;
  }

  return success({
    providers: SEED_PROVIDERS.length,
    models: SEED_MODELS.length,
  });
}
