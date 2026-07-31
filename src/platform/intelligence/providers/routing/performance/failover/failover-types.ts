/**
 * Provider attempt history + failover execution result (M9.5H).
 */

import type { ProviderId } from "../../../../shared/identifiers";
import type { ProviderExecutionResult } from "../../../runtime/contracts/provider-execution-response";
import type {
  AttemptRoutePosition,
  PerformanceFailureCategory,
} from "../contracts/performance-evidence";

export interface ProviderAttemptRecord {
  readonly attemptId: string;
  readonly positionInRoute: number;
  readonly primaryOrFailover: AttemptRoutePosition;
  readonly providerId: string;
  readonly modelId: string;
  readonly success: boolean;
  readonly failureCategory: PerformanceFailureCategory;
  readonly latencyMs: number;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly status: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly exploratory?: boolean;
}

export interface FailoverExecutionOutcome {
  readonly result: ProviderExecutionResult;
  readonly attempts: readonly ProviderAttemptRecord[];
  readonly finalProviderId: ProviderId | string;
  readonly finalModelId: string;
  readonly attemptCount: number;
  readonly failoverCount: number;
  readonly budgetExhausted: boolean;
  readonly exploratory: boolean;
}
