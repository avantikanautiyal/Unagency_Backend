/**
 * Provider execution session.
 *
 * Purpose: Own the mutable state of a single execution session.
 * Responsibilities: Track status, statistics, cancellation, lease, and result.
 * Usage: Created by the runtime; driven by the execution pipeline.
 * Future Extension: Durable session hydration.
 */

import type { Result } from "../../../core/result";
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
import type { ICancellationSource } from "../interfaces/cancellation-engine";
import type { IExecutionMonitor } from "../interfaces/execution-monitor";
import type { IProviderSession } from "../interfaces/provider-session";
import { SessionStateMachine } from "./session-state-machine";

export interface ProviderExecutionSessionDependencies {
  readonly sessionId: string;
  readonly request: ProviderExecutionRequest;
  readonly monitor: IExecutionMonitor;
  readonly cancellationSource: ICancellationSource;
  readonly nowIso: () => string;
}

export class ProviderExecutionSession implements IProviderSession {
  readonly sessionId: string;
  readonly request: ProviderExecutionRequest;
  readonly monitor: IExecutionMonitor;

  private readonly stateMachine: SessionStateMachine;
  private readonly cancellationSource: ICancellationSource;
  private readonly nowIso: () => string;
  private readonly createdAt: string;
  private updatedAt: string;
  private attempts = 0;
  private streamed = false;
  private _lease?: ExecutionLease;
  private _result?: ProviderExecutionResult;

  constructor(deps: ProviderExecutionSessionDependencies) {
    this.sessionId = deps.sessionId;
    this.request = deps.request;
    this.monitor = deps.monitor;
    this.cancellationSource = deps.cancellationSource;
    this.nowIso = deps.nowIso;
    this.stateMachine = new SessionStateMachine("created");
    this.createdAt = deps.nowIso();
    this.updatedAt = this.createdAt;
  }

  get requestId(): string {
    return this.request.requestId;
  }

  get status(): ProviderExecutionStatus {
    return this.stateMachine.status;
  }

  get cancellation(): CancellationToken {
    return this.cancellationSource.token;
  }

  get metadata(): ProviderExecutionMetadata {
    return {
      requestId: this.requestId,
      sessionId: this.sessionId,
      providerId: this.request.providerId,
      attempts: this.attempts,
      streamed: this.streamed,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  transitionTo(
    status: ProviderExecutionStatus
  ): Result<ProviderExecutionStatus> {
    const result = this.stateMachine.transition(status);
    if (result.ok) {
      this.updatedAt = this.nowIso();
      if (status === "streaming") {
        this.streamed = true;
      }
    }
    return result;
  }

  recordAttempt(): void {
    this.attempts += 1;
    this.monitor.setAttempts(this.attempts);
    this.updatedAt = this.nowIso();
  }

  assignLease(lease: ExecutionLease): void {
    this._lease = lease;
    this.updatedAt = this.nowIso();
  }

  setResult(result: ProviderExecutionResult): void {
    this._result = result;
    this.updatedAt = this.nowIso();
  }

  snapshot(): ProviderExecutionSnapshot {
    return {
      sessionId: this.sessionId,
      requestId: this.requestId,
      status: this.status,
      context: this.request.context,
      request: this.request,
      metadata: this.metadata,
      statistics: this.monitor.snapshot(),
      result: this._result,
      capturedAt: this.nowIso(),
    };
  }

  toRecord(): ProviderSession {
    return {
      sessionId: this.sessionId,
      requestId: this.requestId,
      status: this.status,
      context: this.request.context,
      request: this.request,
      metadata: this.metadata,
      statistics: this.monitor.snapshot(),
      result: this._result,
      lease: this._lease,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
