/**
 * Default compatibility engine.
 *
 * Purpose: Validate manifest compatibility for integration.
 * Responsibilities: Structural validation + cross-manifest comparison.
 * Usage: Injected into integration engine.
 * Future Extension: Negotiation capability matrix checks.
 */

import { success, type Result } from "../../../shared/result";
import type { ProviderManifest } from "../../adapters/contracts/provider-manifest";
import type { ProviderCompatibilityReport } from "../contracts/reports";
import type { IProviderCompatibilityEngine } from "../interfaces/subsystems";
import { validateManifestStructure } from "../validation/manifest-validator";

export class DefaultCompatibilityEngine implements IProviderCompatibilityEngine {
  constructor(private readonly nowIso: () => string = () => new Date().toISOString()) {}

  validate(
    manifest: ProviderManifest,
    existing?: ProviderManifest
  ): Result<ProviderCompatibilityReport> {
    const base = validateManifestStructure(manifest);
    if (!base.ok) return base;

    const issues = [...base.value.issues];
    if (existing && existing.providerId !== manifest.providerId) {
      issues.push({
        code: "provider_id_mismatch",
        message: "manifest providerId does not match existing registration",
        severity: "error",
      });
    }
    if (
      existing &&
      existing.version.raw !== manifest.version.raw &&
      existing.vendor === manifest.vendor
    ) {
      issues.push({
        code: "version_change",
        message: `version changed from ${existing.version.raw} to ${manifest.version.raw}`,
        severity: "warning",
      });
    }

    const compatible = !issues.some((i) => i.severity === "error");
    return success({
      providerId: manifest.providerId,
      compatible,
      issues,
      checkedAt: this.nowIso(),
    });
  }
}
