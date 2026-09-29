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
import { classifyExecutionFailure } from "../../routing/performance/failover/failure-classification";
import type { CircuitBreaker } from "../circuit-breaker/circuit-breaker";
import { extractProviderErrorDiagnostics } from "../diagnostics/provider-error-extraction";
import type { CircuitOutcomeContext } from "../diagnostics/circuit-transition-log";

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

function correlationFromSession(session: ProviderExecutionSession): {
  executionId?: string;
  correlationId?: string;
  requestId: string;
  model?: string;
  capability?: string;
} {
  const ctx = session.request.context;
  const meta = session.request.metadata ?? {};
  return {
    executionId: ctx?.executionId ? String(ctx.executionId) : undefined,
    correlationId:
      (ctx?.correlationId ? String(ctx.correlationId) : undefined) ??
      (typeof meta.correlationId === "string" ? meta.correlationId : undefined),
    requestId: session.requestId,
    model: session.request.modelId ? String(session.request.modelId) : undefined,
    capability: session.request.capabilityId
      ? String(session.request.capabilityId)
      : undefined,
  };
}

function toExecutionError(
  error: unknown,
  extras?: Partial<ProviderExecutionError>
): ProviderExecutionError {
  const extracted = extractProviderErrorDiagnostics(error);
  const code =
    extras?.code ??
    (error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : "PROVIDER_ERROR");
  const message =
    extras?.message ??
    extracted.sanitizedMessage ??
    (error instanceof Error ? error.message : "provider execution failed");
  const providerErrorCode =
    extras?.providerErrorCode ?? extracted.providerErrorCode;
  const failureCategory =
    extras?.failureCategory ??
    (extracted.failureCategoryHint === "network"
      ? "network"
      : classifyExecutionFailure({
          error: {
            code,
            message,
            httpStatus: extracted.httpStatus,
            ...(providerErrorCode ? { providerErrorCode } : {}),
          },
          httpStatus: extracted.httpStatus,
          message:
            extracted.failureCategoryHint === "network"
              ? "network failure"
              : message,
        }));
  return {
    code,
    message,
    httpStatus: extras?.httpStatus ?? extracted.httpStatus,
    providerErrorCode,
    providerErrorMessage: extras?.providerErrorMessage ?? extracted.sanitizedMessage,
    failureCategory,
    retryAfterMs: extras?.retryAfterMs,
  };
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
    const ids = correlationFromSession(session);

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
        error: { code: "TIMEOUT_ERROR", message: "queue timed out", failureCategory: "timeout" },
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
    const circuitCtxBase: CircuitOutcomeContext = {
      model: ids.model,
      capability: ids.capability,
      executionId: ids.executionId,
      correlationId: ids.correlationId,
      requestId: ids.requestId,
    };
    if (!breaker.canDispatch(circuitCtxBase)) {
      const snap = breaker.snapshot();
      const retryAfterMs =
        snap.state === "open" && snap.openedAtMs !== undefined && snap.resetTimeoutMs
          ? Math.max(0, snap.resetTimeoutMs - (Date.now() - snap.openedAtMs))
          : snap.resetTimeoutMs ?? 30_000;
      const circuitError: ProviderExecutionError = {
        code: "CIRCUIT_OPEN",
        message: "circuit breaker is open",
        failureCategory: "circuit_open",
        retryAfterMs,
      };
      this.recordFailedAttempt(session, Math.max(1, session.metadata.attempts), circuitError);
      return this.terminate(session, "failed", {
        error: circuitError,
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
        breaker.recordFailure({
          ...circuitCtxBase,
          failureCategory: "timeout",
          reason: "execution_timeout",
          circuitCounted: true,
        });
        this.recordFailedAttempt(session, attempt, {
          code: "TIMEOUT_ERROR",
          message: "execution timed out",
          failureCategory: "timeout",
        });
        if (this.deps.retry.shouldRetry(request.retryPolicy, attempt)) {
          await this.retryDelay(session, attempt);
          continue;
        }
        return this.terminate(session, "timed_out", {
          error: { code: "TIMEOUT_ERROR", message: "execution timed out", failureCategory: "timeout" },
        });
      }

      const dispatchResult = outcome.value;
      if (!dispatchResult.ok) {
        const execError = toExecutionError(dispatchResult.error);
        const failureCategory = classifyExecutionFailure({
          error: execError,
          httpStatus: execError.httpStatus,
        });
        const enriched: ProviderExecutionError = {
          ...execError,
          failureCategory,
        };

        // Don't trip the circuit on permanent model/config mistakes (e.g. Anthropic 404
        // for a retired model id) — those won't recover by waiting.
        const msg = String(dispatchResult.error.message ?? "").toLowerCase();
        const providerCode = String(execError.providerErrorCode ?? "").toLowerCase();
        const permanentMisconfig =
          msg.includes("not registered") ||
          msg.includes("not available") ||
          msg.includes("not_found") ||
          /\bmodel:/.test(msg) ||
          msg.includes("http 404");
        // Transient per-model rate limits — do not open the provider-wide breaker.
        // Credit/billing exhaustion is typed `quota` (even on HTTP 429) and is
        // handled separately so it is never logged as http_429_non_tripping.
        const isTransientRateLimit =
          failureCategory === "rate_limit" &&
          !(
            providerCode === "credit_balance_exhausted" ||
            providerCode.includes("credit_balance") ||
            providerCode.includes("insufficient_quota")
          );
        const isQuotaExhaustion = failureCategory === "quota";
        // Structured-contract mismatches never reach here as HTTP failures
        // (HTTP succeeded → recordSuccess). Keep that invariant.
        const outcomeCtx: CircuitOutcomeContext = {
          ...circuitCtxBase,
          failureCategory,
          httpStatus: enriched.httpStatus,
          providerErrorCode: enriched.providerErrorCode,
        };

        if (isTransientRateLimit) {
          // Preserve 429 policy: log with category, do NOT trip breaker.
          const concrete = breaker as CircuitBreaker;
          if (typeof concrete.observeNonTrippingFailure === "function") {
            concrete.observeNonTrippingFailure({
              ...outcomeCtx,
              failureCategory: "rate_limit",
              httpStatus: enriched.httpStatus ?? 429,
              reason: "http_429_non_tripping",
              circuitCounted: false,
            });
          }
        } else if (isQuotaExhaustion) {
          // Credit/billing exhaustion — observe without tripping (caller skips
          // this provider for the rest of the failover chain via category=quota).
          const concrete = breaker as CircuitBreaker;
          if (typeof concrete.observeNonTrippingFailure === "function") {
            concrete.observeNonTrippingFailure({
              ...outcomeCtx,
              failureCategory: "quota",
              reason: "credit_quota_exhausted_non_tripping",
              circuitCounted: false,
            });
          }
        } else if (!permanentMisconfig) {
          breaker.recordFailure({
            ...outcomeCtx,
            reason: "provider_dispatch_failure",
            circuitCounted: true,
          });
        } else {
          const concrete = breaker as CircuitBreaker;
          if (typeof concrete.observeNonTrippingFailure === "function") {
            concrete.observeNonTrippingFailure({
              ...outcomeCtx,
              reason: "permanent_misconfig_non_tripping",
              circuitCounted: false,
            });
          }
        }

        this.recordFailedAttempt(session, attempt, enriched);

        if (this.deps.retry.shouldRetry(request.retryPolicy, attempt)) {
          await this.retryDelay(session, attempt);
          continue;
        }
        return this.terminate(session, "failed", {
          error: enriched,
        });
      }

      breaker.recordSuccess({
        ...circuitCtxBase,
        reason: "provider_dispatch_success",
        circuitCounted: true,
      });
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
    } else if (status === "timed_out") {
      void this.recordPendingUsage(session, session.metadata.attempts);
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
      .catch((error) => {
        /* accounting must not affect execution — logged in service */
        void error;
      });
  }

  private recordPendingUsage(
    session: ProviderExecutionSession,
    pipelineAttempt: number
  ): void {
    const accounting = getUsageAccountingService();
    const stats = session.monitor.snapshot();
    void accounting
      .recordProviderInvocation({
        request: session.request,
        success: false,
        completedAt: this.deps.nowIso(),
        latencyMs: stats.totalMs,
        pipelineAttempt,
        sessionId: session.sessionId,
        retryCount: Math.max(0, pipelineAttempt - 1),
        timedOut: true,
      })
      .catch((error) => {
        void error;
      });
  }

  /**
   * Persist a lightweight durable failure record via the existing usage ledger.
   * Stores classification + HTTP status — never secrets or prompts.
   */
  private recordFailedAttempt(
    session: ProviderExecutionSession,
    pipelineAttempt: number,
    error: ProviderExecutionError
  ): void {
    const accounting = getUsageAccountingService();
    const stats = session.monitor.snapshot();
    const breaker = this.deps.circuitBreakers.forProvider(session.request.providerId);
    const snap = breaker.snapshot();
    void accounting
      .recordProviderInvocation({
        request: session.request,
        success: false,
        completedAt: this.deps.nowIso(),
        latencyMs: stats.totalMs,
        pipelineAttempt,
        sessionId: session.sessionId,
        retryCount: Math.max(0, pipelineAttempt - 1),
        failureDiagnostics: {
          httpStatus: error.httpStatus,
          providerErrorCode: error.providerErrorCode,
          failureCategory: error.failureCategory,
          circuitState: snap.state,
          sanitizedMessage: error.providerErrorMessage ?? error.message,
        },
      })
      .catch((err) => {
        void err;
      });
  }
}
