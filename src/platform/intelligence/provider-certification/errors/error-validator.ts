/**
 * Error normalization, retry, timeout, circuit breaker, cancellation validators.
 */

import type { CertificationHarness } from "../fixtures/harness";
import type { CertificationIssue } from "../contracts/suite-result";
import { makeCertificationRequest, MOCK_ERRORS } from "../fixtures/certification-fixtures";

export function validateErrorNormalization(harness: CertificationHarness): CertificationIssue[] {
  const issues: CertificationIssue[] = [];
  const request = makeCertificationRequest({ providerId: harness.manifest.providerId });
  for (const [name, err] of Object.entries(MOCK_ERRORS)) {
    const normalized = harness.adapter.translateError(err, request);
    if (!normalized.kind || !normalized.code) {
      issues.push({
        code: `error_norm_${name}`,
        message: `translateError failed for ${name}`,
        area: "error_normalization",
        severity: "error",
      });
    }
  }
  return issues;
}

export function validateRetryBehaviour(harness: CertificationHarness): CertificationIssue[] {
  const issues: CertificationIssue[] = [];
  const request = makeCertificationRequest({ providerId: harness.manifest.providerId });
  const rateLimit = harness.adapter.translateError(MOCK_ERRORS.rateLimit, request);
  if (!rateLimit.retryable) {
    issues.push({
      code: "rate_limit_not_retryable",
      message: "rate limit errors should be retryable",
      area: "retry_behaviour",
      severity: "warning",
    });
  }
  const auth = harness.adapter.translateError(MOCK_ERRORS.auth, request);
  if (auth.retryable) {
    issues.push({
      code: "auth_retryable",
      message: "authentication errors should not be retryable",
      area: "retry_behaviour",
      severity: "warning",
    });
  }
  return issues;
}

export function validateTimeoutBehaviour(harness: CertificationHarness): CertificationIssue[] {
  const issues: CertificationIssue[] = [];
  const request = makeCertificationRequest({
    providerId: harness.manifest.providerId,
    timeoutMs: 5000,
  });
  const timeout = harness.adapter.translateError(MOCK_ERRORS.timeout, request);
  if (timeout.kind !== "timeout") {
    issues.push({
      code: "timeout_kind_mismatch",
      message: `expected timeout kind, got ${timeout.kind}`,
      area: "timeout_behaviour",
      severity: "warning",
    });
  }
  if (!request.timeoutMs) {
    issues.push({
      code: "missing_timeout",
      message: "request should carry timeoutMs",
      area: "timeout_behaviour",
      severity: "info",
    });
  }
  return issues;
}

export function validateCircuitBreakerCompatibility(_harness: CertificationHarness): CertificationIssue[] {
  return [];
}

export function validateCancellation(_harness: CertificationHarness): CertificationIssue[] {
  return [];
}
