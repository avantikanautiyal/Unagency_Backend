/**
 * Default integration diagnostics.
 *
 * Purpose: Produce diagnostic reports for integration issues.
 * Responsibilities: Missing providers, inconsistencies, duplicates, conflicts.
 * Usage: Surfaced by the platform.
 * Future Extension: Auto-remediation suggestions.
 */

import type { ProviderId } from "../../../shared/identifiers";
import type {
  IProviderIntegrationDiagnostics,
  MissingProviderReport,
} from "../interfaces/engine";
import type { InMemoryIntegrationRegistry } from "../registry/in-memory-integration-registry";
import type { DefaultVersionManager } from "../versioning/default-version-manager";
import type { DefaultProviderInstaller } from "../installation/default-installer";
import { validateManifestStructure } from "../validation/manifest-validator";

export class DefaultIntegrationDiagnostics
  implements IProviderIntegrationDiagnostics
{
  constructor(
    private readonly registry: InMemoryIntegrationRegistry,
    private readonly versionManager: DefaultVersionManager,
    private readonly installer: DefaultProviderInstaller,
    private readonly expectedVendors: readonly string[] = []
  ) {}

  missingProviders(): readonly MissingProviderReport[] {
    const registered = new Set(this.registry.list().map((r) => r.vendor));
    return this.expectedVendors
      .filter((v) => !registered.has(v))
      .map((v) => ({
        expectedVendor: v,
        reason: "vendor not registered in integration registry",
      }));
  }

  manifestInconsistencies() {
    return this.registry.list().flatMap((record) => {
      const validation = validateManifestStructure(record.manifest);
      if (!validation.ok || validation.value.compatible) return [];
      return validation.value.issues.map((issue) => ({
        providerId: record.providerId,
        field: issue.code,
        message: issue.message,
      }));
    });
  }

  capabilityMismatches(): readonly string[] {
    const mismatches: string[] = [];
    for (const record of this.registry.list()) {
      const manifestCaps = new Set(record.manifest.capabilities);
      for (const model of record.manifest.models) {
        for (const cap of record.manifest.capabilities) {
          if (!manifestCaps.has(cap)) {
            mismatches.push(
              `${record.providerId}: capability ${cap} not in manifest capabilities list`
            );
          }
        }
        if (model.id && record.manifest.models.length === 0) {
          mismatches.push(`${record.providerId}: model inventory empty`);
        }
      }
    }
    return mismatches;
  }

  duplicateRegistrations() {
    const seen = new Map<string, ProviderId>();
    const duplicates: Array<{
      providerId: ProviderId;
      existingIntegrationId: string;
    }> = [];
    for (const record of this.registry.list()) {
      const key = `${record.vendor}:${record.manifest.version.raw}`;
      const existing = seen.get(key);
      if (existing) {
        duplicates.push({
          providerId: record.providerId,
          existingIntegrationId: String(record.integrationId),
        });
      } else {
        seen.set(key, record.providerId);
      }
    }
    return duplicates;
  }

  versionConflicts() {
    return this.registry.list().flatMap((record) => {
      const version = this.versionManager.get(record.providerId);
      if (!version || version.compatibility === "compatible") return [];
      if (
        version.availableVersion &&
        version.installedVersion !== version.availableVersion
      ) {
        return [
          {
            providerId: record.providerId,
            installed: version.installedVersion,
            requested: version.availableVersion,
          },
        ];
      }
      return [];
    });
  }

  unsupportedFeatures(): readonly string[] {
    const unsupported: string[] = [];
    for (const record of this.registry.list()) {
      if (!record.manifest.features.streaming && record.manifest.streaming.supported) {
        unsupported.push(
          `${record.providerId}: streaming profile enabled but feature flag false`
        );
      }
    }
    return unsupported;
  }

  registrationRecords() {
    return this.registry.list();
  }
}
