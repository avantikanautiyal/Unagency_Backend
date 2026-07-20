/**
 * Request and response validation.
 */

import type { CertificationHarness } from "../fixtures/harness";
import type { CertificationIssue } from "../contracts/suite-result";
import {
  makeCertificationRequest,
  makeMockWireResponse,
} from "../fixtures/certification-fixtures";

export function validateRequestValidation(harness: CertificationHarness): CertificationIssue[] {
  const issues: CertificationIssue[] = [];
  const request = makeCertificationRequest({ providerId: harness.manifest.providerId });
  const result = harness.adapter.validate(request);
  if (!result.ok) {
    issues.push({
      code: "validate_threw",
      message: "adapter.validate() returned failure",
      area: "request_validation",
      severity: "error",
    });
    return issues;
  }
  if (!result.value.valid) {
    issues.push({
      code: "request_invalid",
      message: `validation issues: ${result.value.issues.map((i) => i.code).join(", ")}`,
      area: "request_validation",
      severity: "warning",
    });
  }
  return issues;
}

export function validateResponseValidation(harness: CertificationHarness): CertificationIssue[] {
  const issues: CertificationIssue[] = [];
  const request = makeCertificationRequest({ providerId: harness.manifest.providerId });
  const translate = harness.adapter.translateRequest(request);
  if (!translate.ok) {
    issues.push({
      code: "translate_failed",
      message: "translateRequest failed during response validation",
      area: "response_validation",
      severity: "error",
    });
    return issues;
  }
  const normalized = harness.adapter.normalizeResponse(makeMockWireResponse(), request);
  if (!normalized.ok) {
    issues.push({
      code: "normalize_failed",
      message: "normalizeResponse failed",
      area: "response_validation",
      severity: "error",
    });
    return issues;
  }
  if (!normalized.value.response.requestId) {
    issues.push({
      code: "missing_request_id",
      message: "normalized response missing requestId",
      area: "response_validation",
      severity: "error",
    });
  }
  return issues;
}
