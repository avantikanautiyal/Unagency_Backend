/**
 * Default synchronization engine.
 *
 * Purpose: Synchronize capabilities, models, features, and registry from manifest.
 * Responsibilities: Project inventories + update registry. No provider communication.
 * Usage: Injected into integration engine.
 * Future Extension: Diff-based sync with negotiation catalog.
 */

import { failure, success, type Result } from "../../../shared/result";
import { NotFoundError } from "../../../shared/errors";
import type { ProviderId } from "../../../shared/identifiers";
import type { ProviderSynchronizationReport } from "../contracts/reports";
import type { IProviderSynchronizationEngine } from "../interfaces/subsystems";
import type { InMemoryIntegrationRegistry } from "../registry/in-memory-integration-registry";
import type { IProviderVersionManager } from "../interfaces/subsystems";
import type { ProviderManifest } from "../../adapters/contracts/provider-manifest";
import {
  projectFeatureInventory,
  projectModelInventory,
} from "../manifests/manifest-projection";

export class DefaultSynchronizationEngine
  implements IProviderSynchronizationEngine
{
  constructor(
    private readonly registry: InMemoryIntegrationRegistry,
    private readonly versionManager: IProviderVersionManager,
    private readonly nowIso: () => string = () => new Date().toISOString()
  ) {}

  synchronize(
    providerId: ProviderId,
    manifest: ProviderManifest
  ): Result<ProviderSynchronizationReport> {
    if (!this.registry.has(providerId)) {
      return failure(
        new NotFoundError("provider not registered for sync", { providerId })
      );
    }

    const now = this.nowIso();
    const featureInventory = projectFeatureInventory(manifest, now);
    const modelInventory = projectModelInventory(manifest, now);
    const warnings: string[] = [];

    if (manifest.models.length === 0) {
      warnings.push("manifest declares no models");
    }

    const updated = this.registry.update(providerId, manifest);
    const versionManifest = this.versionManager.track(
      providerId,
      manifest.version.raw
    );

    if (!updated.ok) return updated;
    if (!versionManifest.ok) return versionManifest;

    return success({
      providerId,
      synchronized: true,
      featureInventory,
      modelInventory,
      versionManifest: versionManifest.value,
      registryUpdated: true,
      warnings,
      synchronizedAt: now,
    });
  }
}
