/**
 * Diagnostic + error contracts.
 *
 * Purpose: Canonical, provider-independent diagnostics and errors.
 * Responsibilities: Describe warnings and normalized provider errors.
 * Usage: Produced by validators, normalizers, and error translators.
 * Future Extension: Remediation hints, correlation to telemetry spans.
 */

import type { CanonicalErrorKind, DiagnosticSeverity } from "./enums";

export interface ProviderDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly severity: DiagnosticSeverity;
  readonly source?: string;
  readonly data?: Readonly<Record<string, unknown>>;
}

/**
 * Canonical provider error — all vendor errors normalize into this shape.
 * Carries NO vendor object; `providerCode` is a plain string hint only.
 */
export interface ProviderError {
  readonly kind: CanonicalErrorKind;
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly providerCode?: string;
  /** Non-authoritative status hint; the platform performs NO networking. */
  readonly statusHint?: number;
  readonly details?: Readonly<Record<string, unknown>>;
}
