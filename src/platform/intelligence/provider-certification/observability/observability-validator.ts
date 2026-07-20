/**
 * Observability, logging, metrics, health, diagnostics validators.
 */

import type { CertificationHarness } from "../fixtures/harness";
import type { CertificationIssue } from "../contracts/suite-result";

export function validateObservability(harness: CertificationHarness): CertificationIssue[] {
  const descriptor = harness.adapter.describe();
  if (!descriptor.metadata.adapterId) {
    return [
      {
        code: "missing_adapter_id",
        message: "describe() missing adapterId",
        area: "observability",
        severity: "error",
      },
    ];
  }
  return [];
}

export function validateLogging(_harness: CertificationHarness): CertificationIssue[] {
  return [];
}

export function validateMetrics(_harness: CertificationHarness): CertificationIssue[] {
  return [];
}

export function validateHealthReporting(harness: CertificationHarness): CertificationIssue[] {
  const issues: CertificationIssue[] = [];
  const health = harness.adapter.health();
  if (!health.ok) {
    issues.push({
      code: "health_failed",
      message: "health() returned failure",
      area: "health_reporting",
      severity: "error",
    });
    return issues;
  }
  if (!health.value.checkedAt) {
    issues.push({
      code: "missing_checked_at",
      message: "health summary missing checkedAt",
      area: "health_reporting",
      severity: "warning",
    });
  }
  return issues;
}

export function validateDiagnostics(harness: CertificationHarness): CertificationIssue[] {
  const descriptor = harness.adapter.describe();
  if (!descriptor.manifest.version) {
    return [
      {
        code: "missing_manifest_version",
        message: "descriptor missing manifest version",
        area: "diagnostics",
        severity: "warning",
      },
    ];
  }
  return [];
}
