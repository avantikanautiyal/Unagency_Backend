/**
 * Provider execution response and result contracts.
 *
 * Purpose: Immutable outputs of a provider dispatch and the terminal runtime result.
 * Responsibilities: Carry provider-independent output, usage, and outcome.
 * Usage: Response returned by IProviderDispatcher; Result returned by IProviderRuntime.
 * Future Extension: Structured token/cost accounting; streaming aggregates.
 */

import type { ProviderId } from "../../../core/identifiers";
import type { ProviderExecutionStatistics } from "./provider-execution-metadata";
import type { ProviderExecutionStatus } from "./provider-execution-status";

/**
 * Provider-independent dispatch response.
 * Concrete adapters (M4.2+) map vendor responses into this shape.
 */
export interface ProviderExecutionResponse {
  readonly requestId: string;
  readonly providerId: ProviderId;
  readonly output: Readonly<Record<string, unknown>>;
  readonly usage?: Readonly<Record<string, unknown>>;
  readonly providerRequestId?: string;
  readonly streamed: boolean;
  readonly finishedAt: string;
}

export interface ProviderExecutionError {
  readonly code: string;
  readonly message: string;
}

/**
 * Safe per-provider attempt diagnostics (M9.5H failover). No credentials/payloads.
 */
export interface ProviderAttemptHistoryEntry {
  readonly attemptId: string;
  readonly positionInRoute: number;
  readonly primaryOrFailover: "primary" | "failover";
  readonly providerId: string;
  readonly modelId: string;
  readonly success: boolean;
  readonly failureCategory: string;
  readonly latencyMs: number;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly status: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly exploratory?: boolean;
}

/**
 * Terminal outcome of a provider execution through the runtime.
 */
export interface ProviderExecutionResult {
  readonly requestId: string;
  readonly sessionId: string;
  readonly status: ProviderExecutionStatus;
  readonly success: boolean;
  readonly response?: ProviderExecutionResponse;
  readonly error?: ProviderExecutionError;
  readonly statistics: ProviderExecutionStatistics;
  readonly completedAt: string;
  /** M9.5H — populated when FailoverOrchestrator runs multi-provider attempts. */
  readonly attemptHistory?: readonly ProviderAttemptHistoryEntry[];
  readonly finalProviderId?: string;
  readonly finalModelId?: string;
  readonly failoverCount?: number;
  readonly budgetExhausted?: boolean;
}
