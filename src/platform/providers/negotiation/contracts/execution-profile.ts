/**
 * Execution profile contract.
 *
 * Purpose: The final, negotiated execution parameters.
 * Responsibilities: Provider-independent runtime settings (no vendor specifics).
 * Usage: Embedded in NegotiatedExecution; projectable to a runtime request.
 * Future Extension: Adaptive per-phase settings.
 */

import type { ExecutionMode } from "./planning/execution-mode";
import type { ExecutionPriority } from "./planning/execution-priority";
import type { RetryPolicy } from "../../runtime/contracts/retry-policy";
import type { TimeoutPolicy } from "../../runtime/contracts/timeout-policy";

export interface ExecutionProfile {
  readonly executionMode: ExecutionMode;
  readonly priority: ExecutionPriority;
  readonly retryPolicy: RetryPolicy;
  readonly timeoutPolicy: TimeoutPolicy;
  readonly streaming: boolean;
  readonly humanReviewRequired: boolean;
  readonly evaluationEnabled: boolean;
}
