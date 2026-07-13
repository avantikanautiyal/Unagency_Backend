/**
 * Default version manager.
 *
 * Purpose: Track installed/available versions without package installation.
 * Responsibilities: track, compare, deprecate.
 * Usage: Injected into sync engine and integration engine.
 * Future Extension: Semver constraint engine.
 */

import { success, type Result } from "../../../shared/result";
import type { ProviderId } from "../../../shared/identifiers";
import type { VersionCompatibility } from "../contracts/enums";
import type { ProviderVersionManifest } from "../contracts/versioning";
import type { IProviderVersionManager } from "../interfaces/subsystems";

function parseParts(version: string): number[] {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) return [0, 0, 0];
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(a: string, b: string): number {
  const pa = parseParts(a);
  const pb = parseParts(b);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

export class DefaultVersionManager implements IProviderVersionManager {
  private readonly versions = new Map<string, ProviderVersionManifest>();

  constructor(private readonly nowIso: () => string = () => new Date().toISOString()) {}

  track(
    providerId: ProviderId,
    installedVersion: string,
    availableVersion?: string
  ): Result<ProviderVersionManifest> {
    const compatibility = availableVersion
      ? this.compatibilityFor(installedVersion, availableVersion)
      : "compatible";
    const manifest: ProviderVersionManifest = {
      providerId,
      installedVersion,
      availableVersion,
      compatibility,
      upgradePath:
        availableVersion && compareVersions(availableVersion, installedVersion) > 0
          ? [installedVersion, availableVersion]
          : undefined,
      downgradePath:
        availableVersion && compareVersions(availableVersion, installedVersion) < 0
          ? [installedVersion, availableVersion]
          : undefined,
      deprecated: false,
      checkedAt: this.nowIso(),
    };
    this.versions.set(String(providerId), manifest);
    return success(manifest);
  }

  compare(
    installed: string,
    available: string
  ): Result<ProviderVersionManifest> {
    const cmp = compareVersions(available, installed);
    const compatibility: VersionCompatibility =
      cmp === 0
        ? "compatible"
        : cmp > 0
          ? "upgrade_required"
          : "downgrade_required";
    return success({
      providerId: "unknown" as ProviderId,
      installedVersion: installed,
      availableVersion: available,
      compatibility,
      upgradePath: cmp > 0 ? [installed, available] : undefined,
      downgradePath: cmp < 0 ? [installed, available] : undefined,
      deprecated: false,
      checkedAt: this.nowIso(),
    });
  }

  deprecate(providerId: ProviderId): Result<ProviderVersionManifest> {
    const current = this.versions.get(String(providerId));
    const manifest: ProviderVersionManifest = {
      providerId,
      installedVersion: current?.installedVersion ?? "0.0.0",
      availableVersion: current?.availableVersion,
      compatibility: "deprecated",
      deprecated: true,
      checkedAt: this.nowIso(),
    };
    this.versions.set(String(providerId), manifest);
    return success(manifest);
  }

  get(providerId: ProviderId): ProviderVersionManifest | undefined {
    return this.versions.get(String(providerId));
  }

  private compatibilityFor(
    installed: string,
    available: string
  ): VersionCompatibility {
    const cmp = compareVersions(available, installed);
    if (cmp === 0) return "compatible";
    if (cmp > 0) return "upgrade_required";
    return "downgrade_required";
  }
}
