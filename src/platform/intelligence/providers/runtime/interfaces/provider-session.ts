/**
 * Provider execution session port.
 *
 * Purpose: Own the mutable state of a single execution session.
 * Responsibilities: Track status, statistics, cancellation, and result.
 * Usage: Created by the runtime; driven by the execution pipeline.
 * Future Extension: Durable session hydration.
 */

import type { Result } from "../../../shared/result";
import type { CancellationToken } from "../contracts/cancellation";
import type { ProviderExecutionMetadata } from "../contracts/provider-execution-metadata";
import type { ProviderExecutionRequest } from "../contracts/provider-execution-request";
import type { ProviderExecutionResult } from "../contracts/provider-execution-response";
import type {
  ProviderExecutionSnapshot,
  ProviderSession,
} from "../contracts/provider-session";
import type { ProviderExecutionStatus } from "../contracts/provider-execution-status";
import type { ExecutionLease } from "../contracts/queue";
import type { IExecutionMonitor } from "./execution-monitor";

export interface IProviderSession {
  readonly sessionId: string;
  readonly requestId: string;
  readonly status: ProviderExecutionStatus;
  readonly request: ProviderExecutionRequest;
  readonly cancellation: CancellationToken;
  readonly monitor: IExecutionMonitor;
  readonly metadata: ProviderExecutionMetadata;

  transitionTo(status: ProviderExecutionStatus): Result<ProviderExecutionStatus>;
  assignLease(lease: ExecutionLease): void;
  setResult(result: ProviderExecutionResult): void;
  snapshot(): ProviderExecutionSnapshot;
  toRecord(): ProviderSession;
}
