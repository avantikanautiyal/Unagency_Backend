/**
 * Model Registry testing utilities.
 */

import { asProviderId } from "../../core/identifiers";
import {
  createModelRegistryPlatform,
  type CreateModelRegistryPlatformOptions,
  type ModelRegistryPlatform,
} from "../factories/create-model-registry-platform";
import type { ModelSearchRequest } from "../contracts/search";
import { providerIdForVendor } from "../discovery/inventory-seed";

export const TEST_OPENAI_PROVIDER = providerIdForVendor("openai");
export const TEST_GPT4O_MODEL = "openai/gpt-4o";

export function deterministicHelpers() {
  let idCounter = 0;
  return {
    createId: (prefix: string) => `${prefix}_${++idCounter}`,
    nowIso: () => "2026-01-01T00:00:00.000Z",
  };
}

export function setupModelRegistryPlatform(
  options: CreateModelRegistryPlatformOptions = {}
): ModelRegistryPlatform {
  const helpers = deterministicHelpers();
  return createModelRegistryPlatform({
    loadSeed: true,
    createId: helpers.createId,
    nowIso: helpers.nowIso,
    ...options,
  });
}

export function sampleSearchRequest(
  overrides?: Partial<ModelSearchRequest>
): ModelSearchRequest {
  return {
    query: overrides?.query,
    providerId: overrides?.providerId ?? asProviderId("provider.openai"),
    capability: overrides?.capability,
    modality: overrides?.modality,
    latencyTier: overrides?.latencyTier,
    qualityTier: overrides?.qualityTier,
    maxInputCostPer1k: overrides?.maxInputCostPer1k,
    region: overrides?.region,
    lifecycle: overrides?.lifecycle,
    limit: overrides?.limit ?? 20,
    offset: overrides?.offset ?? 0,
  };
}
