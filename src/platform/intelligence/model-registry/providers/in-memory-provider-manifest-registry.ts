/**
 * Provider manifest registry.
 */

import { success, type Result } from "../../shared/result";
import type { ProviderId } from "../../shared/identifiers";
import type { ProviderManifest } from "../contracts/provider";
import type { IProviderManifestRegistry } from "../interfaces/model-registry";
import type { InMemoryModelRegistryStore } from "../models/in-memory-model-registry";

export class InMemoryProviderManifestRegistry implements IProviderManifestRegistry {
  constructor(private readonly store: InMemoryModelRegistryStore) {}

  register(manifest: ProviderManifest): Result<void> {
    return this.store.registerProviderManifest(manifest);
  }

  get(providerId: ProviderId): Result<ProviderManifest> {
    return this.store.getProviderManifest(providerId);
  }

  list(): Result<readonly ProviderManifest[]> {
    return success(this.store.listProviderManifests());
  }
}
