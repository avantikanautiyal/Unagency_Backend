/**
 * Structured JSON output validator.
 */

import type { CertificationHarness } from "../fixtures/harness";
import type { CertificationIssue } from "../contracts/suite-result";
import {
  makeCertificationRequest,
  makeJsonWireResponse,
} from "../fixtures/certification-fixtures";

export function validateStructuredJsonOutput(harness: CertificationHarness): CertificationIssue[] {
  const issues: CertificationIssue[] = [];
  if (!harness.manifest.features.jsonMode && !harness.manifest.features.structuredOutputs) {
    return [
      {
        code: "json_not_declared",
        message: "manifest does not declare JSON/structured output",
        area: "structured_json_output",
        severity: "info",
      },
    ];
  }
  const request = makeCertificationRequest({
    providerId: harness.manifest.providerId,
    features: ["json_mode"],
    parameters: { responseFormat: "json_object" },
  });
  const translate = harness.adapter.translateRequest(request);
  if (!translate.ok) {
    issues.push({
      code: "json_translate_failed",
      message: "JSON mode translateRequest failed",
      area: "structured_json_output",
      severity: "error",
    });
  }
  const normalized = harness.adapter.normalizeResponse(makeJsonWireResponse(), request);
  if (!normalized.ok) {
    issues.push({
      code: "json_normalize_failed",
      message: "JSON response normalization failed",
      area: "structured_json_output",
      severity: "error",
    });
  }
  return issues;
}
