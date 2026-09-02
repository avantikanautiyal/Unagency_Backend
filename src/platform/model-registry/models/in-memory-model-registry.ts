/**
 * In-memory model registry storage.
 */

import type { ProviderId } from "../../core/identifiers";
import { NotFoundError, ValidationError } from "../../core/errors";
import { failure, success, type Result } from "../../core/result";
import type { CanonicalModel, ModelManifest } from "../contracts/model";
import type { CanonicalProvider, ProviderManifest } from "../contracts/provider";

export class InMemoryModelRegistryStore {
  private readonly providers = new Map<string, CanonicalProvider>();
  private readonly providerManifests = new Map<string, ProviderManifest>();
  private readonly models = new Map<string, CanonicalModel>();
  private readonly modelManifests = new Map<string, ModelManifest>();
  private readonly modelsByProvider = new Map<string, Set<string>>();

  registerProviderManifest(manifest: ProviderManifest): Result<void> {
    const id = String(manifest.provider.providerId);
    if (this.providers.has(id)) {
      return failure(new ValidationError(`provider already registered: ${id}`));
    }
    this.providers.set(id, manifest.provider);
    this.providerManifests.set(id, manifest);
    this.modelsByProvider.set(id, new Set());
    return success(undefined);
  }

  registerModelManifest(manifest: ModelManifest): Result<void> {
    const modelKey = String(manifest.model.modelId);
    const providerKey = String(manifest.model.providerId);
    if (this.models.has(modelKey)) {
      return failure(new ValidationError(`model already registered: ${modelKey}`));
    }
    if (!this.providers.has(providerKey)) {
      return failure(new ValidationError(`unknown provider: ${providerKey}`));
    }
    this.models.set(modelKey, manifest.model);
    this.modelManifests.set(modelKey, manifest);
    this.modelsByProvider.get(providerKey)?.add(modelKey);
    return success(undefined);
  }

  getProvider(providerId: ProviderId): Result<CanonicalProvider> {
    const p = this.providers.get(String(providerId));
    if (!p) return failure(new NotFoundError(`provider not found: ${providerId}`));
    return success(p);
  }

  getModel(modelId: string): Result<CanonicalModel> {
    const m = this.models.get(modelId);
    if (!m) return failure(new NotFoundError(`model not found: ${modelId}`));
    return success(m);
  }

  listProviders(): readonly CanonicalProvider[] {
    return [...this.providers.values()];
  }

  listModels(providerId?: ProviderId): readonly CanonicalModel[] {
    if (!providerId) return [...this.models.values()];
    const keys = this.modelsByProvider.get(String(providerId));
    if (!keys) return [];
    return [...keys].map((k) => this.models.get(k)!).filter(Boolean);
  }

  allModels(): readonly CanonicalModel[] {
    return [...this.models.values()];
  }

  getProviderManifest(providerId: ProviderId): Result<ProviderManifest> {
    const m = this.providerManifests.get(String(providerId));
    if (!m) return failure(new NotFoundError(`provider manifest not found: ${providerId}`));
    return success(m);
  }

  listProviderManifests(): readonly ProviderManifest[] {
    return [...this.providerManifests.values()];
  }

  getModelManifest(modelId: string): Result<ModelManifest> {
    const m = this.modelManifests.get(modelId);
    if (!m) return failure(new NotFoundError(`model manifest not found: ${modelId}`));
    return success(m);
  }

  allCapabilities(): readonly string[] {
    const caps = new Set<string>();
    for (const m of this.models.values()) {
      for (const c of m.capabilities) caps.add(c.capabilityId);
    }
    for (const p of this.providerManifests.values()) {
      for (const c of p.capabilities) caps.add(c);
    }
    return [...caps].sort();
  }
}
