/**
 * Template error model — maps to shared ProviderError taxonomy.
 */

import type { CanonicalErrorKind } from "../../adapters/contracts/enums";
import type { ProviderError } from "../../adapters/contracts/diagnostics";
import type { TemplateErrorKind } from "./enums";

export interface TemplateProviderError extends ProviderError {
  readonly templateKind: TemplateErrorKind;
}

export const TEMPLATE_TO_CANONICAL_ERROR: Record<TemplateErrorKind, CanonicalErrorKind> = {
  authentication: "authentication",
  rate_limit: "rate_limit",
  quota: "quota",
  timeout: "timeout",
  network: "unavailable",
  validation: "unknown",
  model: "provider_internal",
  safety: "content_policy",
  streaming: "provider_internal",
  tool: "provider_internal",
  internal: "provider_internal",
};

export function createTemplateError(
  templateKind: TemplateErrorKind,
  code: string,
  message: string,
  retryable: boolean,
  details?: Readonly<Record<string, unknown>>
): TemplateProviderError {
  return {
    kind: TEMPLATE_TO_CANONICAL_ERROR[templateKind],
    templateKind,
    code,
    message,
    retryable,
    details,
  };
}
