/**
 * Provider session and snapshot contracts.
 *
 * Purpose: Immutable session record and point-in-time snapshot.
 * Responsibilities: Describe the full state of an execution session.
 * Usage: Produced by the session store and the runtime snapshot query.
 * Future Extension: Durable session persistence.
 */

import type { ProviderExecutionMetadata, ProviderExecutionStatistics } from "./provider-execution-metadata";
import type { ProviderExecutionContext, ProviderExecutionRequest } from "./provider-execution-request";
import type { ProviderExecutionResult } from "./provider-execution-response";
import type { ProviderExecutionStatus } from "./provider-execution-status";
import type { ExecutionLease } from "./queue";

export interface ProviderSession {
  readonly sessionId: string;
  readonly requestId: string;
  readonly status: ProviderExecutionStatus;
  readonly context: ProviderExecutionContext;
  readonly request: ProviderExecutionRequest;
  readonly metadata: ProviderExecutionMetadata;
  readonly statistics: ProviderExecutionStatistics;
  readonly result?: ProviderExecutionResult;
  readonly lease?: ExecutionLease;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProviderExecutionSnapshot {
  readonly sessionId: string;
  readonly requestId: string;
  readonly status: ProviderExecutionStatus;
  readonly context: ProviderExecutionContext;
  readonly request: ProviderExecutionRequest;
  readonly metadata: ProviderExecutionMetadata;
  readonly statistics: ProviderExecutionStatistics;
  readonly result?: ProviderExecutionResult;
  readonly capturedAt: string;
}
