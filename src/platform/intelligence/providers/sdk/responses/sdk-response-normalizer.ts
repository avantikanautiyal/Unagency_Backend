/**
 * SDK response normalization helpers.
 *
 * Purpose: Ensure SdkResponse statistics and success flags are consistent.
 * Responsibilities: Normalize terminal SdkResponse fields.
 * Usage: Optional post-processing after wrapper execute.
 * Future Extension: Token usage normalization.
 */

import type { SdkResponse } from "../contracts/request-response";
import type { SdkStatistics } from "../contracts/errors";

export function normalizeSdkResponse(
  response: SdkResponse,
  statistics: SdkStatistics
): SdkResponse {
  const success =
    response.success &&
    (response.statusHint === undefined || response.statusHint < 400);
  return {
    ...response,
    success,
    statistics,
  };
}
