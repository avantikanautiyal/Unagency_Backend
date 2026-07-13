/**
 * Manifest validator for integration.
 *
 * Purpose: Validate ProviderManifest completeness for integration.
 * Responsibilities: Structural checks; no vendor-specific logic.
 * Usage: Engine pre-flight and compatibility engine.
 * Future Extension: Schema-based validation.
 */

import { failure, success, type Result } from "../../../shared/result";
import { ValidationError } from "../../../shared/errors";
import type { ProviderManifest } from "../../adapters/contracts/provider-manifest";
import type {
  ProviderCompatibilityIssue,
  ProviderCompatibilityReport,
} from "../contracts/reports";

export function validateManifestStructure(
  manifest: ProviderManifest
): Result<ProviderCompatibilityReport> {
  const issues: ProviderCompatibilityIssue[] = [];

  if (!manifest.providerId) {
    issues.push({
      code: "missing_provider_id",
      message: "manifest requires providerId",
      severity: "error",
    });
  }
  if (!manifest.vendor) {
    issues.push({
      code: "missing_vendor",
      message: "manifest requires vendor",
      severity: "error",
    });
  }
  if (!manifest.version?.raw) {
    issues.push({
      code: "missing_version",
      message: "manifest requires version",
      severity: "error",
    });
  }
  if (manifest.models.length === 0) {
    issues.push({
      code: "no_models",
      message: "manifest should declare at least one model",
      severity: "warning",
    });
  }
  if (manifest.capabilities.length === 0) {
    issues.push({
      code: "no_capabilities",
      message: "manifest should declare capabilities",
      severity: "warning",
    });
  }

  const compatible = !issues.some((i) => i.severity === "error");
  return success({
    providerId: manifest.providerId,
    compatible,
    issues,
    checkedAt: new Date().toISOString(),
  });
}

export function validateManifestOrFail(
  manifest: ProviderManifest
): Result<void> {
  const result = validateManifestStructure(manifest);
  if (!result.ok) return result;
  if (!result.value.compatible) {
    return failure(
      new ValidationError("manifest validation failed", {
        issues: result.value.issues,
      })
    );
  }
  return success(undefined);
}
