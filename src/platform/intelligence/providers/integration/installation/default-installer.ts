/**
 * Default provider installer.
 *
 * Purpose: In-memory provider installation (no package installs).
 * Responsibilities: install/uninstall/get/list.
 * Usage: Injected into integration engine.
 * Future Extension: Dependency resolution.
 */

import { failure, success, type Result } from "../../../shared/result";
import { NotFoundError } from "../../../shared/errors";
import type { ProviderId } from "../../../shared/identifiers";
import type { ProviderInstallation } from "../contracts/installation";
import type { InstallationId } from "../contracts/identifiers";
import { asInstallationId } from "../contracts/identifiers";
import type { ProviderManifest } from "../../adapters/contracts/provider-manifest";
import type { IProviderInstaller } from "../interfaces/subsystems";

export class DefaultProviderInstaller implements IProviderInstaller {
  private readonly installations = new Map<string, ProviderInstallation>();

  constructor(
    private readonly nowIso: () => string = () => new Date().toISOString(),
    private readonly createId: (prefix: string) => string = (p) =>
      `${p}_${Math.random().toString(36).slice(2)}`
  ) {}

  install(manifest: ProviderManifest): Result<ProviderInstallation> {
    const key = String(manifest.providerId);
    const existing = this.installations.get(key);
    if (existing && existing.state === "installed") {
      return success(existing);
    }

    const now = this.nowIso();
    const installation: ProviderInstallation = {
      installationId: asInstallationId(this.createId("install")),
      providerId: manifest.providerId,
      manifest,
      state: "installed",
      installedAt: now,
      metadata: { placeholder: true },
    };
    this.installations.set(key, installation);
    return success(installation);
  }

  uninstall(providerId: ProviderId): Result<ProviderInstallation> {
    const current = this.installations.get(String(providerId));
    if (!current) {
      return failure(
        new NotFoundError("installation not found", { providerId })
      );
    }
    const updated: ProviderInstallation = {
      ...current,
      state: "uninstalled",
      uninstalledAt: this.nowIso(),
    };
    this.installations.set(String(providerId), updated);
    return success(updated);
  }

  get(providerId: ProviderId): ProviderInstallation | undefined {
    return this.installations.get(String(providerId));
  }

  list(): readonly ProviderInstallation[] {
    return [...this.installations.values()];
  }
}
