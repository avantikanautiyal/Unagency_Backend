/**
 * Provider execution response and result contracts.
 *
 * Purpose: Immutable outputs of a provider dispatch and the terminal runtime result.
 * Responsibilities: Carry provider-independent output, usage, and outcome.
 * Usage: Response returned by IProviderDispatcher; Result returned by IProviderRuntime.
 * Future Extension: Structured token/cost accounting; streaming aggregates.
 */

import type { ProviderId } from "../../../shared/identifiers";
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
}
