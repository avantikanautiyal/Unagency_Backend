/**
 * Default provider error translator.
 *
 * Purpose: Normalize any raw error into a canonical ProviderError.
 * Responsibilities: Classify into a CanonicalErrorKind and set retryability.
 * Usage: Injected into adapters and the engine; replaceable per provider.
 * Future Extension: Per-provider code maps (M4.5 concrete adapters).
 *
 * Performs NO networking. Uses only the error's own shape/keywords.
 */

import type { ProviderError } from "../contracts/diagnostics";
import type { CanonicalErrorKind } from "../contracts/enums";
import type { IProviderErrorTranslator } from "../interfaces/validation";

const RETRYABLE_KINDS: readonly CanonicalErrorKind[] = [
  "rate_limit",
  "timeout",
  "unavailable",
  "provider_internal",
];

interface ErrorShape {
  readonly code?: string;
  readonly message: string;
  readonly statusHint?: number;
  readonly providerCode?: string;
}

function coerce(error: unknown): ErrorShape {
  if (typeof error === "string") {
    return { message: error };
  }
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const status =
      typeof record.status === "number"
        ? record.status
        : typeof record.statusCode === "number"
          ? record.statusCode
          : undefined;
    return {
      code: typeof record.code === "string" ? record.code : undefined,
      message:
        typeof record.message === "string" ? record.message : String(error),
      statusHint: status,
      providerCode:
        typeof record.providerCode === "string"
          ? record.providerCode
          : typeof record.code === "string"
            ? record.code
            : undefined,
    };
  }
  return { message: String(error) };
}

function classify(shape: ErrorShape): CanonicalErrorKind {
  const haystack = `${shape.code ?? ""} ${shape.message}`.toLowerCase();
  const status = shape.statusHint;

  if (status === 401 || /unauthenticated|invalid api key|missing key/.test(haystack)) {
    return "authentication";
  }
  if (status === 403 || /unauthorized|forbidden|permission/.test(haystack)) {
    return "authorization";
  }
  if (status === 429 || /rate.?limit|too many requests/.test(haystack)) {
    return "rate_limit";
  }
  if (status === 408 || /timeout|timed out|deadline/.test(haystack)) {
    return "timeout";
  }
  if (/quota|insufficient_quota|billing|credit/.test(haystack)) {
    return "quota";
  }
  if (/content.?policy|safety|moderation|flagged/.test(haystack)) {
    return "content_policy";
  }
  if (status === 503 || status === 502 || /unavailable|overloaded|capacity/.test(haystack)) {
    return "unavailable";
  }
  if ((status !== undefined && status >= 500) || /internal|server error/.test(haystack)) {
    return "provider_internal";
  }
  return "unknown";
}

export class DefaultProviderErrorTranslator implements IProviderErrorTranslator {
  normalize(
    error: unknown,
    context?: Readonly<Record<string, unknown>>
  ): ProviderError {
    // Already canonical? Pass through (idempotent).
    if (isProviderError(error)) {
      return error;
    }

    const shape = coerce(error);
    const kind = classify(shape);
    return {
      kind,
      code: `provider_${kind}`,
      message: shape.message,
      retryable: RETRYABLE_KINDS.includes(kind),
      providerCode: shape.providerCode,
      statusHint: shape.statusHint,
      details: context,
    };
  }
}

function isProviderError(value: unknown): value is ProviderError {
  return (
    !!value &&
    typeof value === "object" &&
    "kind" in value &&
    "retryable" in value &&
    "code" in value &&
    "message" in value
  );
}
