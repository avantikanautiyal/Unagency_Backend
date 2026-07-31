/**
 * Maps provider operation state → canonical execution API status.
 */

import type { ExecutionApiStatus } from "../../../../api/contracts/enums";
import type { ProviderOperationState } from "../contracts/provider-operation-state";

export function mapProviderOperationToExecutionStatus(
  state: ProviderOperationState
): ExecutionApiStatus {
  switch (state) {
    case "created":
    case "submitting":
    case "submitted":
      return "running";
    case "pending":
      return "waiting_provider";
    case "completed":
    case "result_ingesting":
      return "processing_result";
    case "artifact_created":
      return "succeeded";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    default:
      return "running";
  }
}
