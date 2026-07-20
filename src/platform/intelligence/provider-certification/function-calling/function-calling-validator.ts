/**
 * Tool and function calling validators.
 */

import type { CertificationHarness } from "../fixtures/harness";
import type { CertificationIssue } from "../contracts/suite-result";
import {
  makeCertificationRequest,
  makeToolCallWireResponse,
} from "../fixtures/certification-fixtures";

export function validateToolCalling(harness: CertificationHarness): CertificationIssue[] {
  const issues: CertificationIssue[] = [];
  if (!harness.manifest.features.toolCalling) {
    return [
      {
        code: "tool_calling_not_declared",
        message: "manifest does not declare tool calling",
        area: "tool_calling",
        severity: "info",
      },
    ];
  }
  const request = makeCertificationRequest({
    providerId: harness.manifest.providerId,
    features: ["tool_calling"],
    input: {
      messages: [{ role: "user", content: "Search for sneakers" }],
      tools: [{ type: "function", function: { name: "search", parameters: {} } }],
    },
  });
  const translate = harness.adapter.translateRequest(request);
  if (!translate.ok) {
    issues.push({
      code: "tool_translate_failed",
      message: "tool calling translateRequest failed",
      area: "tool_calling",
      severity: "error",
    });
  }
  const normalized = harness.adapter.normalizeResponse(makeToolCallWireResponse(), request);
  if (!normalized.ok) {
    issues.push({
      code: "tool_normalize_failed",
      message: "tool call response normalization failed",
      area: "tool_calling",
      severity: "error",
    });
  }
  return issues;
}

export function validateFunctionCalling(harness: CertificationHarness): CertificationIssue[] {
  const issues = validateToolCalling(harness);
  return issues.map((i) => ({ ...i, area: "function_calling" as const }));
}
