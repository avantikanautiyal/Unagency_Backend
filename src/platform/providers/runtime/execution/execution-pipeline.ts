/**
 * Provider execution pipeline.
 *
 * Purpose: Run a single session through dispatch with retry, timeout,
 *   cancellation, streaming, and circuit-breaker guarding.
 * Responsibilities: Drive status transitions and produce a terminal result.
 * Usage: Invoked by the runtime once a lease has been acquired.
 * Future Extension: Fallback provider selection between attempts.
 *
 * Contains NO provider SDK calls — all dispatch flows through IProviderDispatcher.
 */

import type { Result } from "../../../core/result";
import type { ProviderExecutionResponse } from "../contracts/provider-execution-response";
import type { ProviderExecutionError, ProviderExecutionResult } from "../contracts/provider-execution-response";
import {
  ProviderExecutionEventTypes,
  type ProviderExecutionEventType,
} from "../contracts/provider-execution-event";
import {
  isTerminalProviderExecutionStatus,
  type ProviderExecutionStatus,
} from "../contracts/provider-execution-status";
import type { StreamingChunk } from "../contracts/streaming";
import type { ICancellationSource } from "../interfaces/cancellation-engine";
import type { ICircuitBreakerRegistry } from "../interfaces/circuit-breaker";
import type { IProviderDispatcher } from "../interfaces/provider-dispatcher";
import type { IProviderRuntimeEventPublisher } from "../interfaces/event-publisher";
import type { IRetryEngine } from "../interfaces/retry-engine";
import type { IStreamingRuntime } from "../interfaces/streaming-runtime";
import type { ITimeoutEngine } from "../interfaces/timeout-engine";
import type { ProviderExecutionSession } from "../sessions/provider-execution-session";
import { getUsageAccountingService } from "../../../accounting/usage/usage-accounting-service";

type Settled<T> =
  | { readonly tag: "value"; readonly value: T }
  | { readonly tag: "timeout" }
  | { readonly tag: "cancelled"; readonly reason?: string };

export interface ExecutionPipelineDependencies {
  readonly dispatcher: IProviderDispatcher;
  readonly retry: IRetryEngine;
  readonly timeout: ITimeoutEngine;
  readonly streaming: IStreamingRuntime;
  readonly circuitBreakers: ICircuitBreakerRegistry;
  readonly events: IProviderRuntimeEventPublisher;
  readonly nowIso: () => string;
  readonly sleep: (ms: number) => Promise<void>;
}

export class ExecutionPipeline {
  constructor(private readonly deps: ExecutionPipelineDependencies) {}

  async run(
    session: ProviderExecutionSession,
    cancellationSource: ICancellationSource
  ): Promise<ProviderExecutionResult> {
    const { request } = session;
    const monitor = session.monitor;
    const providerId = request.providerId;

    monitor.markDequeued();

    // Queue timeout guard.
    const queueTimeoutMs = this.deps.timeout.resolveQueueTimeoutMs(
      request.timeoutPolicy
    );
    if (
      queueTimeoutMs > 0 &&
      monitor.snapshot().queueWaitMs > queueTimeoutMs
    ) {
      return this.terminate(session, "timed_out", {
        error: { code: "TIMEOUT_ERROR", message: "queue timed out" },
      });
    }

    if (cancellationSource.token.cancelled) {
      return this.terminate(session, "cancelled", {
        error: {
          code: "EXECUTION_ERROR",
          message: cancellationSource.token.reason ?? "cancelled",
        },
      });
    }

    this.transition(session, "reserved");
    await this.publish(ProviderExecutionEventTypes.SESSION_RESERVED, session);

    const breaker = this.deps.circuitBreakers.forProvider(providerId);
    if (!breaker.canDispatch()) {
      return this.terminate(session, "failed", {
        error: {
          code: "PROVIDER_ERROR",
          message: "circuit breaker is open",
        },
      });
    }

    this.transition(session, "dispatching");
    await this.publish(ProviderExecutionEventTypes.SESSION_DISPATCHING, session);

    let attempt = 0;
    while (true) {
      if (cancellationSource.token.cancelled) {
        return this.terminate(session, "cancelled", {
          error: {
            code: "EXECUTION_ERROR",
            message: cancellationSource.token.reason ?? "cancelled",
          },
        });
      }

      attempt += 1;
      session.recordAttempt();

      const outcome = await this.attemptDispatch(session, cancellationSource);

      if (outcome.tag === "cancelled") {
        return this.terminate(session, "cancelled", {
          error: {
            code: "EXECUTION_ERROR",
            message: outcome.reason ?? "cancelled",
          },
        });
      }

      if (outcome.tag === "timeout") {
        monitor.recordTimeout();
        breaker.recordFailure();
        if (this.deps.retry.shouldRetry(request.retryPolicy, attempt)) {
          await this.retryDelay(session, attempt);
          continue;
        }
        return this.terminate(session, "timed_out", {
          error: { code: "TIMEOUT_ERROR", message: "execution timed out" },
        });
      }

      const dispatchResult = outcome.value;
      if (!dispatchResult.ok) {
        // Don't trip the circuit on permanent model/config mistakes (e.g. Anthropic 404
        // for a retired model id) — those won't recover by waiting.
        const msg = String(dispatchResult.error.message ?? "").toLowerCase();
        const permanentMisconfig =
          msg.includes("not registered") ||
          msg.includes("not available") ||
          msg.includes("not_found") ||
          /\bmodel:/.test(msg) ||
          msg.includes("http 404");
        if (!permanentMisconfig) {
          breaker.recordFailure();
        }
        if (this.deps.retry.shouldRetry(request.retryPolicy, attempt)) {
          await this.retryDelay(session, attempt);
          continue;
        }
        return this.terminate(session, "failed", {
          error: {
            code: dispatchResult.error.code,
            message: dispatchResult.error.message,
          },
        });
      }

      breaker.recordSuccess();
      return this.terminate(session, "completed", {
        response: dispatchResult.value,
      });
    }
  }

  private async attemptDispatch(
    session: ProviderExecutionSession,
    cancellationSource: ICancellationSource
  ): Promise<Settled<Result<ProviderExecutionResponse>>> {
    const { request } = session;
    const monitor = session.monitor;
    const providerId = request.providerId;
    const token = cancellationSource.token;

    this.transition(session, "waiting");
    await this.publish(ProviderExecutionEventTypes.SESSION_WAITING, session);

    monitor.markDispatchStart();

    const canStream =
      request.streaming &&
      this.deps.dispatcher.supportsStreaming(providerId) &&
      typeof this.deps.dispatcher.dispatchStreaming === "function";

    let outcome: Settled<Result<ProviderExecutionResponse>>;

    if (canStream) {
      this.transition(session, "streaming");
      await this.publish(ProviderExecutionEventTypes.SESSION_STREAMING, session);
      this.deps.streaming.open(request, session.sessionId);
      monitor.markStreamingStart();

      const onChunk = (chunk: StreamingChunk): void => {
        this.deps.streaming.push(session.sessionId, chunk);
        monitor.recordStreamingChunk();
      };

      const work = this.deps.dispatcher.dispatchStreaming!(
        request,
        token,
        onChunk
      );
      const timeoutMs = this.deps.timeout.resolveStreamingTimeoutMs(
        request.timeoutPolicy
      );
      outcome = await this.race(work, timeoutMs, cancellationSource);

      monitor.markStreamingEnd();
      this.deps.streaming.close(session.sessionId);
    } else {
      monitor.markExecutionStart();
      const work = this.deps.dispatcher.dispatch(request, token);
      const timeoutMs = this.deps.timeout.resolveExecutionTimeoutMs(
        request.timeoutPolicy
      );
      outcome = await this.race(work, timeoutMs, cancellationSource);
      monitor.markExecutionEnd();
    }

    monitor.markDispatchEnd();
    return outcome;
  }

  private async retryDelay(
    session: ProviderExecutionSession,
    attempt: number
  ): Promise<void> {
    session.monitor.recordRetry();
    await this.publish(ProviderExecutionEventTypes.SESSION_RETRYING, session);
    const delay = this.deps.retry.nextDelayMs(session.request.retryPolicy, attempt);
    if (delay > 0) {
      await this.deps.sleep(delay);
    }
  }

  private async race<T>(
    work: Promise<T>,
    timeoutMs: number,
    cancellationSource: ICancellationSource
  ): Promise<Settled<T>> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<Settled<T>>((resolve) => {
      if (timeoutMs <= 0) {
        return;
      }
      timer = setTimeout(() => resolve({ tag: "timeout" }), timeoutMs);
      if (typeof timer.unref === "function") {
        timer.unref();
      }
    });

    const cancelPromise = cancellationSource
      .whenCancelled()
      .then(({ reason }) => ({ tag: "cancelled", reason } as Settled<T>));

    const valuePromise = work.then((value) => ({
      tag: "value",
      value,
    } as Settled<T>));

    const result = await Promise.race([
      valuePromise,
      timeoutPromise,
      cancelPromise,
    ]);
    if (timer) {
      clearTimeout(timer);
    }
    return result;
  }

  private terminate(
    session: ProviderExecutionSession,
    status: ProviderExecutionStatus,
    opts: {
      readonly response?: ProviderExecutionResponse;
      readonly error?: ProviderExecutionError;
    }
  ): ProviderExecutionResult {
    if (!isTerminalProviderExecutionStatus(session.status)) {
      this.transition(session, status);
    }
    session.monitor.markCompleted();

    if (opts.response) {
      void this.recordUsage(
        session,
        opts.response,
        status === "completed",
        session.metadata.attempts
      );
    }

    const finalStatus = session.status;
    const result: ProviderExecutionResult = {
      requestId: session.requestId,
      sessionId: session.sessionId,
      status: finalStatus,
      success: finalStatus === "completed",
      response: opts.response,
      error: opts.error,
      statistics: session.monitor.snapshot(),
      completedAt: this.deps.nowIso(),
    };
    session.setResult(result);

    void this.publish(this.terminalEventType(finalStatus), session);
    return result;
  }

  private terminalEventType(
    status: ProviderExecutionStatus
  ): ProviderExecutionEventType {
    switch (status) {
      case "completed":
        return ProviderExecutionEventTypes.SESSION_COMPLETED;
      case "cancelled":
        return ProviderExecutionEventTypes.SESSION_CANCELLED;
      case "timed_out":
        return ProviderExecutionEventTypes.SESSION_TIMED_OUT;
      default:
        return ProviderExecutionEventTypes.SESSION_FAILED;
    }
  }

  private transition(
    session: ProviderExecutionSession,
    status: ProviderExecutionStatus
  ): void {
    session.transitionTo(status);
  }

  private async publish(
    type: ProviderExecutionEventType,
    session: ProviderExecutionSession
  ): Promise<void> {
    await this.deps.events.publish(type, {
      sessionId: session.sessionId,
      requestId: session.requestId,
      providerId: String(session.request.providerId),
      status: session.status,
      attempt: session.metadata.attempts,
    });
  }

  private recordUsage(
    session: ProviderExecutionSession,
    response: ProviderExecutionResponse,
    success: boolean,
    pipelineAttempt: number
  ): void {
    const accounting = getUsageAccountingService();
    const stats = session.monitor.snapshot();
    void accounting
      .recordProviderInvocation({
        request: session.request,
        response,
        success,
        completedAt: this.deps.nowIso(),
        latencyMs: stats.totalMs,
        pipelineAttempt,
        sessionId: session.sessionId,
        retryCount: Math.max(0, pipelineAttempt - 1),
      })
      .catch(() => {
        /* accounting must not affect execution */
      });
  }
}
