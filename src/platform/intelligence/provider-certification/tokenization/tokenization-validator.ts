/**
 * Token accounting and context window validators.
 */

import type { CertificationHarness } from "../fixtures/harness";
import type { CertificationIssue } from "../contracts/suite-result";
import {
  makeCertificationRequest,
  makeMockWireResponse,
} from "../fixtures/certification-fixtures";

export function validateTokenAccounting(harness: CertificationHarness): CertificationIssue[] {
  const issues: CertificationIssue[] = [];
  const request = makeCertificationRequest({ providerId: harness.manifest.providerId });
  const normalized = harness.adapter.normalizeResponse(makeMockWireResponse(), request);
  if (!normalized.ok) return issues;
  if (!normalized.value.response.usage) {
    issues.push({
      code: "missing_usage",
      message: "normalized response missing token usage",
      area: "token_accounting",
      severity: "warning",
    });
  } else if (
    normalized.value.response.usage.totalTokens === undefined &&
    normalized.value.response.usage.promptTokens === undefined
  ) {
    issues.push({
      code: "incomplete_usage",
      message: "token usage incomplete",
      area: "token_accounting",
      severity: "warning",
    });
  }
  return issues;
}

export function validateContextWindow(harness: CertificationHarness): CertificationIssue[] {
  const issues: CertificationIssue[] = [];
  const model = harness.manifest.models[0];
  if (!model) {
    issues.push({
      code: "no_models",
      message: "manifest has no models for context window check",
      area: "context_window_validation",
      severity: "error",
    });
    return issues;
  }
  const ctx = model.capability.contextWindow;
  if (!ctx || ctx <= 0) {
    issues.push({
      code: "missing_context_window",
      message: "model missing context window metadata",
      area: "context_window_validation",
      severity: "warning",
    });
  }
  return issues;
}
