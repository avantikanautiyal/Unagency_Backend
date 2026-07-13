/**
 * Provider runtime engine.
 *
 * Purpose: Execute provider requests through the complete runtime lifecycle:
 *   create → reserve → queue → dispatch → execute → stream → complete → snapshot.
 * Responsibilities: Session management, queueing, concurrency limiting,
 *   cancellation, metrics, and snapshots. Delegates dispatch to the pipeline.
 * Usage: Constructed via createProviderRuntime; the single execution entry point.
 * Future Extension: Provider adapters plug in via IProviderDispatcher.
 *
 * Contains NO provider SDK calls, networking, or persistence.
 */

import { failure, success } from "../../../shared/result";
import type { Result } from "../../../shared/result";
import type { ProviderExecutionRequest } from "../contracts/provider-execution-request";
import type { ProviderExecutionResult } from "../contracts/provider-execution-response";
import {
  ProviderExecutionEventTypes,
} from "../contracts/provider-execution-event";
import type { ProviderExecutionSnapshot } from "../contracts/provider-session";
import { isTerminalProviderExecutionStatus } from "../contracts/provider-execution-status";
import type { ProviderRuntimeSnapshot } from "../contracts/runtime-metrics";
import {
  ProviderRequestValidationError,
  ProviderRuntimeError,
  ProviderSessionNotFoundError,
} from "../errors";
import { ExecutionPipeline } from "../execution/execution-pipeline";
import type { ICancellationEngine, ICancellationSource } from "../interfaces/cancellation-engine";
import type { ICircuitBreakerRegistry } from "../interfaces/circuit-breaker";
import type { IConcurrencyManager } from "../interfaces/concurrency-manager";
import type { IProviderRuntimeEventPublisher } from "../interfaces/event-publisher";
import type { IExecutionQueue } from "../interfaces/execution-queue";
import type { IProviderDispatcher } from "../interfaces/provider-dispatcher";
import type { IProviderRuntime } from "../interfaces/provider-runtime";
import type { IProviderRuntimeMetrics } from "../interfaces/runtime-metrics";
import type { IRetryEngine } from "../interfaces/retry-engine";
import type { IStreamingRuntime } from "../interfaces/streaming-runtime";
import type { ITimeoutEngine } from "../interfaces/timeout-engine";
import { ProviderExecutionMonitor } from "../monitor/execution-monitor";
import { ProviderExecutionSession } from "../sessions/provider-execution-session";
import type { IProviderSessionStore } from "../sessions/session-store";

export interface ProviderRuntimeDependencies {
  readonly dispatcher: IProviderDispatcher;
  readonly queue: IExecutionQueue;
  readonly concurrency: IConcurrencyManager;
  readonly retry: IRetryEngine;
  readonly timeout: ITimeoutEngine;
  readonly cancellation: ICancellationEngine;
  readonly streaming: IStreamingRuntime;
  readonly circuitBreakers: ICircuitBreakerRegistry;
  readonly events: IProviderRuntimeEventPublisher;
  readonly metrics: IProviderRuntimeMetrics;
  readonly store: IProviderSessionStore;
  readonly nowIso: () => string;
  readonly nowMs: () => number;
  readonly createId: (prefix: string) => string;
  readonly sleep: (ms: number) => Promise<void>;
}

interface SessionEntry {
  readonly session: ProviderExecutionSession;
  readonly source: ICancellationSource;
}

const OWNER_ID = "provider-runtime";

export class ProviderRuntime implements IProviderRuntime {
  private readonly pipeline: ExecutionPipeline;
  private readonly sessions = new Map<string, SessionEntry>();
  private readonly waiters = new Map<
    string,
    (result: Result<ProviderExecutionResult>) => void
  >();
  private disposed = false;

  constructor(private readonly deps: ProviderRuntimeDependencies) {
    this.pipeline = new ExecutionPipeline({
      dispatcher: deps.dispatcher,
      retry: deps.retry,
      timeout: deps.timeout,
      streaming: deps.streaming,
      circuitBreakers: deps.circuitBreakers,
      events: deps.events,
      nowIso: deps.nowIso,
      sleep: deps.sleep,
    });
  }

  async execute(
    request: ProviderExecutionRequest
  ): Promise<Result<ProviderExecutionResult>> {
    if (this.disposed) {
      return failure(new ProviderRuntimeError("Provider runtime is disposed"));
    }

    const validation = this.validate(request);
    if (!validation.ok) {
      return validation;
    }

    const sessionId = this.deps.createId("psession");
    const source = this.deps.cancellation.createSource();
    const monitor = new ProviderExecutionMonitor(this.deps.nowMs);
    const session = new ProviderExecutionSession({
      sessionId,
      request,
      monitor,
      cancellationSource: source,
      nowIso: this.deps.nowIso,
    });

    this.sessions.set(sessionId, { session, source });
    this.persist(session);
    await this.deps.events.publish(
      ProviderExecutionEventTypes.SESSION_CREATED,
      this.eventFor(session)
    );

    const resultPromise = new Promise<Result<ProviderExecutionResult>>(
      (resolve) => {
        this.waiters.set(sessionId, resolve);
      }
    );

    session.transitionTo("queued");
    monitor.markEnqueued();
    const enqueue = this.deps.queue.enqueue({
      sessionId,
      requestId: request.requestId,
      providerId: request.providerId,
      priority: request.priority,
      enqueuedAt: this.deps.nowIso(),
      enqueuedAtMs: this.deps.nowMs(),
    });
    if (!enqueue.ok) {
      this.sessions.delete(sessionId);
      this.waiters.delete(sessionId);
      return enqueue;
    }
    this.persist(session);
    await this.deps.events.publish(
      ProviderExecutionEventTypes.SESSION_QUEUED,
      this.eventFor(session)
    );

    this.drain();
    return resultPromise;
  }

  async cancel(sessionId: string, reason?: string): Promise<Result<void>> {
    if (this.disposed) {
      return failure(new ProviderRuntimeError("Provider runtime is disposed"));
    }
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      return failure(
        new ProviderSessionNotFoundError("Provider session not found", {
          sessionId,
        })
      );
    }

    const { session, source } = entry;
    if (isTerminalProviderExecutionStatus(session.status)) {
      return success(undefined);
    }

    // Not yet dispatched: cancel synchronously and dequeue.
    if (session.status === "created" || session.status === "queued") {
      this.deps.queue.remove(sessionId);
      session.transitionTo("cancelled");
      session.monitor.markCompleted();
      const result = this.buildTerminalResult(session, "cancelled", reason);
      session.setResult(result);
      this.persist(session);
      await this.deps.events.publish(
        ProviderExecutionEventTypes.SESSION_CANCELLED,
        this.eventFor(session)
      );
      this.finish(sessionId, result);
      this.drain();
      return success(undefined);
    }

    // In-flight: trigger the cancellation source; the pipeline will terminate.
    source.cancel(reason);
    return success(undefined);
  }

  getSession(sessionId: string): Result<ProviderExecutionSnapshot> {
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      return failure(
        new ProviderSessionNotFoundError("Provider session not found", {
          sessionId,
        })
      );
    }
    return success(entry.session.snapshot());
  }

  getRuntimeSnapshot(): ProviderRuntimeSnapshot {
    return this.deps.metrics.snapshot(
      this.deps.concurrency.active,
      this.deps.queue.size
    );
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const { session, source } of this.sessions.values()) {
      if (!isTerminalProviderExecutionStatus(session.status)) {
        source.cancel("runtime_disposed");
      }
    }
    for (const [sessionId, resolve] of this.waiters.entries()) {
      resolve(
        failure(
          new ProviderRuntimeError("Provider runtime disposed", { sessionId })
        )
      );
    }
    this.waiters.clear();
    this.deps.queue.clear();
    this.deps.store.clear();
  }

  private drain(): void {
    if (this.disposed) {
      return;
    }
    while (this.deps.queue.size > 0 && this.deps.concurrency.hasCapacity()) {
      const dequeued = this.deps.queue.dequeue();
      if (!dequeued.ok) {
        break;
      }
      const item = dequeued.value;
      const entry = this.sessions.get(item.sessionId);
      if (!entry) {
        continue;
      }

      const reservation = this.deps.concurrency.reserve(
        item.sessionId,
        item.providerId
      );
      if (!reservation.ok) {
        this.deps.queue.enqueue(item);
        break;
      }
      const lease = this.deps.concurrency.acquire(reservation.value, OWNER_ID);
      if (!lease.ok) {
        this.deps.concurrency.releaseReservation(
          reservation.value.reservationId
        );
        this.deps.queue.enqueue(item);
        break;
      }

      entry.session.assignLease(lease.value);
      const leaseId = lease.value.leaseId;

      void this.runSession(entry).then((result) => {
        this.deps.concurrency.release(leaseId);
        this.finish(item.sessionId, result);
        this.drain();
      });
    }
  }

  private async runSession(
    entry: SessionEntry
  ): Promise<ProviderExecutionResult> {
    const result = await this.pipeline.run(entry.session, entry.source);
    this.persist(entry.session);
    return result;
  }

  private finish(sessionId: string, result: ProviderExecutionResult): void {
    this.deps.metrics.record(result);
    const resolve = this.waiters.get(sessionId);
    if (resolve) {
      this.waiters.delete(sessionId);
      resolve(success(result));
    }
  }

  private validate(
    request: ProviderExecutionRequest
  ): Result<ProviderExecutionRequest> {
    if (!request.requestId) {
      return failure(
        new ProviderRequestValidationError("requestId is required")
      );
    }
    if (!request.providerId) {
      return failure(
        new ProviderRequestValidationError("providerId is required", {
          requestId: request.requestId,
        })
      );
    }
    if (!request.capabilityId) {
      return failure(
        new ProviderRequestValidationError("capabilityId is required", {
          requestId: request.requestId,
        })
      );
    }
    if (!request.retryPolicy || !request.timeoutPolicy) {
      return failure(
        new ProviderRequestValidationError(
          "retryPolicy and timeoutPolicy are required",
          { requestId: request.requestId }
        )
      );
    }
    return success(request);
  }

  private buildTerminalResult(
    session: ProviderExecutionSession,
    status: "cancelled" | "timed_out" | "failed",
    message?: string
  ): ProviderExecutionResult {
    return {
      requestId: session.requestId,
      sessionId: session.sessionId,
      status,
      success: false,
      error: {
        code: status === "timed_out" ? "TIMEOUT_ERROR" : "EXECUTION_ERROR",
        message: message ?? status,
      },
      statistics: session.monitor.snapshot(),
      completedAt: this.deps.nowIso(),
    };
  }

  private persist(session: ProviderExecutionSession): void {
    this.deps.store.save(session.toRecord());
  }

  private eventFor(session: ProviderExecutionSession) {
    return {
      sessionId: session.sessionId,
      requestId: session.requestId,
      providerId: String(session.request.providerId),
      status: session.status,
      attempt: session.metadata.attempts,
    };
  }
}
