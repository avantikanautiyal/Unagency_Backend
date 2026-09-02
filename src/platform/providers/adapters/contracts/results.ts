/**
 * Result contracts for translation / normalization / validation.
 *
 * Purpose: Wrap transformed values with warnings + lossiness metadata.
 * Responsibilities: Make translation/normalization outcomes inspectable.
 * Usage: Returned by translators, normalizers, validators.
 * Future Extension: Confidence scores per transformation.
 */

import type { ProviderDiagnostic } from "./diagnostics";
import type { DiagnosticSeverity } from "./enums";
import type { ProviderAdapterResponse } from "./adapter-io";

/**
 * Generic translation result. `value` is the transformed artifact; `warnings`
 * and `droppedFields` explain any lossy mapping.
 */
export interface ProviderTranslationResult<T> {
  readonly value: T;
  readonly warnings: readonly ProviderDiagnostic[];
  readonly droppedFields: readonly string[];
}

export interface ProviderNormalizationResult {
  readonly response: ProviderAdapterResponse;
  readonly warnings: readonly ProviderDiagnostic[];
  readonly normalizedFields: readonly string[];
}

export interface ProviderValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly severity: DiagnosticSeverity;
  readonly path?: string;
}

export interface ProviderValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ProviderValidationIssue[];
}
