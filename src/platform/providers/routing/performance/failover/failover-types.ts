/**
 * Provider attempt history + failover execution result (M9.5H).
 */

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
  readonly httpStatus?: number;
  readonly providerErrorCode?: string;
  readonly circuitStateBefore?: string;
  readonly circuitStateAfter?: string;
  readonly durationMs?: number;
}

