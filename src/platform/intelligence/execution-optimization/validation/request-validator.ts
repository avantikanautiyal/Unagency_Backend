/**
 * Request validator.
 */

import { ValidationError } from "../../shared/errors";
import type { ExecutionOptimizationRequest } from "../contracts/request";

export function validateExecutionOptimizationRequest(
  request: ExecutionOptimizationRequest
): ValidationError | null {
  if (!request.requestId?.trim()) {
    return new ValidationError("requestId is required");
  }
  if (!request.capabilityId) {
    return new ValidationError("capabilityId is required");
  }
  if (!request.inputs) {
    return new ValidationError("inputs are required");
  }
  const hasData =
    (request.inputs.executionArtifacts?.length ?? 0) > 0 ||
    (request.inputs.evaluationReports?.length ?? 0) > 0 ||
    (request.inputs.learningResults?.length ?? 0) > 0 ||
    (request.inputs.observabilityReports?.length ?? 0) > 0 ||
    (request.inputs.intelligenceResults?.length ?? 0) > 0;
  if (!hasData) {
    return new ValidationError("at least one historical input is required");
  }
  return null;
}
