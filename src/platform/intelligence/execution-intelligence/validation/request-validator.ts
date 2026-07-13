/**
 * Request validator.
 */

import { ValidationError } from "../../shared/errors";
import type { ExecutionIntelligenceRequest } from "../contracts/request";

export function validateExecutionIntelligenceRequest(
  request: ExecutionIntelligenceRequest
): ValidationError | null {
  if (!request.requestId?.trim()) {
    return new ValidationError("requestId is required");
  }
  if (!request.capabilityId) {
    return new ValidationError("capabilityId is required");
  }
  if (!request.context) {
    return new ValidationError("context is required");
  }
  if (!request.knowledge) {
    return new ValidationError("knowledge is required");
  }
  if (!request.compiledPrompt) {
    return new ValidationError("compiledPrompt is required");
  }
  if (!request.compiledPrompt.messages?.length) {
    return new ValidationError("compiledPrompt must contain messages");
  }
  return null;
}
