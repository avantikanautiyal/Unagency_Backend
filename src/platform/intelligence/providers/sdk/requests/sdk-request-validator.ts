/**
 * SDK request validation helpers.
 *
 * Purpose: Validate SdkRequest shape before engine dispatch.
 * Responsibilities: Structural checks only (no vendor logic).
 * Usage: Optional pre-flight validation.
 * Future Extension: Schema-based validation.
 */

import { failure, success, type Result } from "../../../shared/result";
import { ValidationError } from "../../../shared/errors";
import type { SdkRequest } from "../contracts/request-response";

export function validateSdkRequest(request: SdkRequest): Result<void> {
  if (!request.requestId) {
    return failure(new ValidationError("requestId is required"));
  }
  if (!request.providerId) {
    return failure(new ValidationError("providerId is required"));
  }
  if (!request.vendor) {
    return failure(new ValidationError("vendor is required"));
  }
  if (!request.operation) {
    return failure(new ValidationError("operation is required"));
  }
  return success(undefined);
}
