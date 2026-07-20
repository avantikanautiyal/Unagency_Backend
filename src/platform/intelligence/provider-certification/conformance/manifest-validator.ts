/**
 * Manifest, model discovery, metadata validators.
 */

import { validateManifestStructure } from "../../providers/integration/validation/manifest-validator";
import type { CertificationHarness } from "../fixtures/harness";
import type { CertificationIssue } from "../contracts/suite-result";

export function validateCapabilityManifest(harness: CertificationHarness): CertificationIssue[] {
  const issues: CertificationIssue[] = [];
  const result = validateManifestStructure(harness.manifest);
  if (!result.ok) {
    issues.push({
      code: "manifest_validation_failed",
      message: "manifest structure validation failed",
      area: "capability_manifest",
      severity: "error",
    });
    return issues;
  }
  for (const issue of result.value.issues) {
    issues.push({
      code: issue.code,
      message: issue.message,
      area: "capability_manifest",
      severity: issue.severity === "error" ? "error" : "warning",
    });
  }
  return issues;
}

export function validateModelDiscovery(harness: CertificationHarness): CertificationIssue[] {
  const issues: CertificationIssue[] = [];
  if (harness.manifest.models.length === 0) {
    issues.push({
      code: "no_models",
      message: "no models declared in manifest",
      area: "model_discovery",
      severity: "error",
    });
  }
  return issues;
}

export function validateModelMetadata(harness: CertificationHarness): CertificationIssue[] {
  const issues: CertificationIssue[] = [];
  for (const model of harness.manifest.models) {
    if (!model.id) {
      issues.push({
        code: "model_missing_id",
        message: "model missing id",
        area: "model_metadata",
        severity: "error",
      });
    }
    if (!model.displayName) {
      issues.push({
        code: "model_missing_display_name",
        message: `model ${model.id} missing displayName`,
        area: "model_metadata",
        severity: "warning",
      });
    }
  }
  return issues;
}

export function validatePerformance(harness: CertificationHarness): CertificationIssue[] {
  const descriptor = harness.adapter.describe();
  if (!descriptor.supportedFeatures.length) {
    return [
      {
        code: "no_features",
        message: "adapter reports no supported features",
        area: "performance",
        severity: "info",
      },
    ];
  }
  return [];
}
