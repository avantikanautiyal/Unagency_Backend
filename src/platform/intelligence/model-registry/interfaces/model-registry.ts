/**
 * Model Registry public interfaces.
 */

import type { Result } from "../../shared/result";
import type { ProviderId } from "../../shared/identifiers";
import type { CanonicalModel, ModelManifest } from "../contracts/model";
import type { CanonicalProvider, ProviderManifest } from "../contracts/provider";
import type { ModelDiscoveryResult } from "../contracts/search";
import type { ModelSearchRequest, ModelSearchResult } from "../contracts/search";
import type { ModelSnapshot, ModelStatistics } from "../contracts/statistics";
import type { ModelCompatibilityProfile } from "../contracts/compatibility";
import type { ModelLifecycleState } from "../contracts/enums";
import type { ModelPricing } from "../contracts/pricing";
import type { ModelLimits } from "../contracts/limits";
import type { ModelRegion } from "../contracts/regions";

export interface IModelRegistry {
  registerProvider(manifest: ProviderManifest): Result<CanonicalProvider>;
  registerModel(manifest: ModelManifest): Result<CanonicalModel>;
  getProvider(providerId: ProviderId): Result<CanonicalProvider>;
  getModel(modelId: string): Result<CanonicalModel>;
  listProviders(): Result<readonly CanonicalProvider[]>;
  listModels(providerId?: ProviderId): Result<readonly CanonicalModel[]>;
  snapshot(): Result<ModelSnapshot>;
  statistics(): Result<ModelStatistics>;
}

export interface IProviderManifestRegistry {
  register(manifest: ProviderManifest): Result<void>;
  get(providerId: ProviderId): Result<ProviderManifest>;
  list(): Result<readonly ProviderManifest[]>;
}

export interface IModelDiscoveryEngine {
  discoverAll(): Result<ModelDiscoveryResult>;
  discoverProvider(providerId: ProviderId): Result<ModelDiscoveryResult>;
  listCapabilities(): Result<readonly string[]>;
}

export interface IModelSearchEngine {
  search(request: ModelSearchRequest): Result<ModelSearchResult>;
  searchCapabilities(query?: string): Result<readonly string[]>;
}

export interface ICompatibilityEngine {
  profile(model: CanonicalModel): Result<ModelCompatibilityProfile>;
  isCompatible(model: CanonicalModel, capabilityId: string): Result<boolean>;
}

export interface IModelLifecycleManager {
  getLifecycle(modelId: string): Result<ModelLifecycle>;
  canTransition(from: ModelLifecycleState, to: ModelLifecycleState): Result<boolean>;
}

export interface IModelValidationEngine {
  validateProvider(manifest: ProviderManifest): Result<readonly string[]>;
  validateModel(manifest: ModelManifest): Result<readonly string[]>;
  validateRegistry(): Result<readonly string[]>;
}

export interface IPricingEngine {
  estimateCost(
    model: CanonicalModel,
    inputTokens: number,
    outputTokens: number
  ): Result<number>;
  comparePricing(models: readonly CanonicalModel[]): Result<readonly CanonicalModel[]>;
}

export interface ILimitsEngine {
  getLimits(modelId: string): Result<ModelLimits>;
  fitsContext(model: CanonicalModel, tokenCount: number): Result<boolean>;
}

export interface IRegionEngine {
  getRegions(modelId: string): Result<readonly ModelRegion[]>;
  isAvailableInRegion(model: CanonicalModel, regionId: string): Result<boolean>;
}
