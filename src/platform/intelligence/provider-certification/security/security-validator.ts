/**
 * Security validators — authentication and region handling.
 */

import type { CertificationHarness } from "../fixtures/harness";
import type { CertificationIssue } from "../contracts/suite-result";

export function validateAuthenticationContract(harness: CertificationHarness): CertificationIssue[] {
  const issues: CertificationIssue[] = [];
  if (harness.manifest.authenticationTypes.length === 0) {
    issues.push({
      code: "no_auth_types",
      message: "manifest missing authentication types",
      area: "authentication_contract",
      severity: "error",
    });
  }
  return issues;
}

export function validateRegionHandling(harness: CertificationHarness): CertificationIssue[] {
  const issues: CertificationIssue[] = [];
  if (harness.manifest.supportedRegions.length === 0) {
    issues.push({
      code: "no_regions",
      message: "manifest missing supported regions",
      area: "region_handling",
      severity: "warning",
    });
  }
  return issues;
}

export function validateCostReporting(harness: CertificationHarness): CertificationIssue[] {
  const issues: CertificationIssue[] = [];
  const model = harness.manifest.models[0];
  const costMeta = model?.metadata?.costPerInputToken ?? model?.metadata?.costPerOutputToken;
  if (model && !costMeta) {
    issues.push({
      code: "missing_cost_metadata",
      message: "model missing cost metadata (optional)",
      area: "cost_reporting",
      severity: "info",
    });
  }
  return issues;
}
