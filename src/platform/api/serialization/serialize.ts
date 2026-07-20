/**
 * Serialization — stable JSON envelopes for SDK generation.
 */

import type { ApiErrorBody, ApiSuccessBody, ApiVersion } from "../contracts";

export function serializeSuccess<T>(
  data: T,
  meta?: Record<string, unknown>
): ApiSuccessBody<T> {
  return meta ? { data, meta } : { data };
}

export function serializeError(
  code: string,
  message: string,
  details?: Record<string, unknown>
): ApiErrorBody {
  return {
    error: details ? { code, message, details } : { code, message },
  };
}

export function defaultHeaders(version: ApiVersion): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-api-version": version,
    "x-platform": "unagency-enterprise-api",
  };
}
