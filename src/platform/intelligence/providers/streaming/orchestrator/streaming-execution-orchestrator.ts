/**
 * M9.5O — Streaming execution orchestrator with commit-boundary failover.
 * Extends Provider Runtime semantics — not a second AI runtime.
 */

import { CostCalculator } from "../../../cost/calculator/cost-calculator";
import type { CanonicalCostRecord } from "../../../cost/contracts/cost-integrity";
import type { CancellationToken } from "../../runtime/contracts/cancellation";
import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import { CancellationSource } from "../../runtime/cancellation/cancellation-engine";
import { StreamCommitTracker, mayFailoverOrRetry } from "../contracts/stream-commit";
import type {
  ProviderStreamEvent,
  StreamTerminationReason,
} from "../contracts/provider-stream-event";
import { StreamOutputAssembler } from "../assembly/stream-output-assembler";
import type { INativeStreamingDispatcher } from "../interfaces/native-streaming-dispatcher";
import type { StreamingRuntimeConfig } from "../config/streaming-config";
import { loadStreamingRuntimeConfig } from "../config/streaming-config";
import {
  getActiveStreamRegistry,
  type ActiveStreamRegistry,
} from "../registry/active-stream-registry";
import { StreamingMetrics } from "../observability/streaming-metrics";

export interface StreamingCandidate {
  readonly providerId: string;
  readonly modelId: string;
  readonly dispatcher: INativeStreamingDispatcher;
  readonly primaryOrFailover: "primary" | "failover";
  readonly positionInRoute: number;
}

export interface StreamingAttemptEvidence {
  readonly attemptId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly firstOutputAt?: string;
  readonly committed: boolean;
  readonly terminationReason: StreamTerminationReason;
  readonly providerFailure: boolean;
  readonly clientOrInfraTermination: boolean;
  readonly timeToFirstTokenMs?: number;
  readonly streamDurationMs: number;
  readonly eventCount: number;
  readonly charsEmitted: number;
  readonly bytesEmitted: number;
}

export interface StreamingExecutionResult {
  readonly executionId: string;
  readonly success: boolean;
  readonly terminationReason: StreamTerminationReason;
  readonly streamCommitted: boolean;
  readonly preCommitFailovers: number;
  readonly attempts: readonly StreamingAttemptEvidence[];
  readonly finalContent: string;
  readonly finalReasoning: string;
  readonly usageStatus: "unknown" | "partial" | "final";
  readonly usage: ReturnType<StreamOutputAssembler["snapshot"]>["usage"];
  readonly cost: CanonicalCostRecord | null;
  readonly toolCalls: ReturnType<StreamOutputAssembler["snapshot"]>["toolCalls"];
  readonly partial: boolean;
  readonly firstChunkLatencyMs?: number;
  readonly totalStreamDurationMs: number;
  readonly eventCount: number;
  readonly events: readonly ProviderStreamEvent[];
}

export interface StreamingOrchestratorOptions {
  readonly config?: StreamingRuntimeConfig;
  readonly costCalculator?: CostCalculator;
  readonly nowIso?: () => string;
  readonly nowMs?: () => number;
  readonly createId?: (prefix: string) => string;
  readonly sleep?: (ms: number) => Promise<void>;
  /** Emit events to transport as they are produced (after commit checks). */
  readonly onEvent?: (event: ProviderStreamEvent) => void | Promise<void>;
  readonly activeStreams?: ActiveStreamRegistry;
  readonly metrics?: StreamingMetrics;
}

function isRecoverablePreCommit(code?: string): boolean {
  const c = (code ?? "").toLowerCase();
  return (
    c.includes("rate_limit") ||
    c.includes("timeout") ||
    c.includes("unavailable") ||
    c.includes("provider_internal") ||
    c.includes("circuit") ||
    c === "fail_before_output"
  );
}

export class StreamingExecutionOrchestrator {
  private readonly config: StreamingRuntimeConfig;
  private readonly nowIso: () => string;
  private readonly nowMs: () => number;
  private readonly createId: (prefix: string) => string;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: StreamingOrchestratorOptions = {}) {
    this.config = opts.config ?? loadStreamingRuntimeConfig({});
    this.nowIso = opts.nowIso ?? (() => new Date().toISOString());
    this.nowMs = opts.nowMs ?? (() => Date.now());
    this.createId =
      opts.createId ?? ((p) => `${p}_${Math.random().toString(36).slice(2, 10)}`);
    this.sleep =
      opts.sleep ??
      ((ms) => (ms <= 0 ? Promise.resolve() : new Promise((r) => setTimeout(r, ms))));
  }

  async execute(input: {
    readonly executionId: string;
    readonly request: ProviderExecutionRequest;
    readonly candidates: readonly StreamingCandidate[];
    readonly token?: CancellationToken;
    readonly organizationId?: string;
  }): Promise<StreamingExecutionResult> {
    const startedMs = this.nowMs();
    const parentCancel = new CancellationSource();
    if (input.token?.cancelled) {
      parentCancel.cancel(input.token.reason ?? "cancelled");
    }

    const emitted: ProviderStreamEvent[] = [];
    const attempts: StreamingAttemptEvidence[] = [];
    let preCommitFailovers = 0;
    let globalAssembler = new StreamOutputAssembler();
    let streamCommitted = false;
    let firstChunkLatencyMs: number | undefined;
    let terminationReason: StreamTerminationReason = "completed";
    let success = false;

    if (!input.request.streaming) {
      return this.terminal({
        executionId: input.executionId,
        success: false,
        terminationReason: "streaming_not_supported",
        streamCommitted: false,
        preCommitFailovers: 0,
        attempts: [],
        assembler: globalAssembler,
        firstChunkLatencyMs: undefined,
        startedMs,
        events: [],
      });
    }

    const nativeCandidates = input.candidates.filter((c) =>
      c.dispatcher.supportsNativeStreaming({
        ...input.request,
        providerId: c.providerId as never,
      })
    );

    if (nativeCandidates.length === 0) {
      return this.terminal({
        executionId: input.executionId,
        success: false,
        terminationReason: "streaming_not_supported",
        streamCommitted: false,
        preCommitFailovers: 0,
        attempts: [],
        assembler: globalAssembler,
        firstChunkLatencyMs: undefined,
        startedMs,
        events: [],
      });
    }

    const registry = this.opts.activeStreams ?? getActiveStreamRegistry();
    if (!registry.acceptingNewStreams) {
      return this.terminal({
        executionId: input.executionId,
        success: false,
        terminationReason: "server_shutdown",
        streamCommitted: false,
        preCommitFailovers: 0,
        attempts: [],
        assembler: globalAssembler,
        firstChunkLatencyMs: undefined,
        startedMs,
        events: [],
      });
    }

    const metrics = this.opts.metrics;
    metrics?.onStart();

    for (let i = 0; i < nativeCandidates.length; i++) {
      if (parentCancel.token.cancelled) {
        terminationReason = mapCancelReason(parentCancel.token.reason);
        break;
      }
      if (this.nowMs() - startedMs > this.config.maxDurationMs) {
        terminationReason = "max_duration";
        break;
      }

      const candidate = nativeCandidates[i]!;
      const attemptId = this.createId("sattempt");
      const attemptStarted = this.nowIso();
      const attemptStartedMs = this.nowMs();
      const commit = new StreamCommitTracker();
      const attemptAssembler = new StreamOutputAssembler();
      const abort = new AbortController();
      parentCancel.onCancel((reason) => abort.abort(reason ?? "cancelled"));

      registry.register({
        executionId: input.executionId,
        attemptId,
        organizationId: input.organizationId,
        providerId: candidate.providerId,
        startedAt: attemptStarted,
        committed: false,
        abort,
      });

      let attemptTerm: StreamTerminationReason = "completed";
      let providerFailure = false;
      let clientOrInfra = false;
      let sawFail = false;
      let lastEventAt = this.nowMs();
      let firstOutputAt: string | undefined;

      const emit = async (event: ProviderStreamEvent) => {
        emitted.push(event);
        attemptAssembler.ingest(event);
        // Only assemble into global after commit path allows (same attempt output).
        globalAssembler.ingest(event);
        const newlyCommitted = commit.observe(event);
        if (newlyCommitted) {
          streamCommitted = true;
          firstOutputAt = event.at;
          if (firstChunkLatencyMs === undefined) {
            firstChunkLatencyMs = this.nowMs() - startedMs;
          }
          registry.markCommitted(input.executionId);
        }
        lastEventAt = this.nowMs();
        await this.opts.onEvent?.(event);
      };

      try {
        const firstOutputTimer = this.config.firstOutputTimeoutMs;
        const iter = candidate.dispatcher.stream(
          {
            ...input.request,
            providerId: candidate.providerId as never,
            modelId: candidate.modelId,
            streaming: true,
          },
          {
            executionId: input.executionId,
            attemptId,
            token: parentCancel.token,
            abortSignal: abort.signal,
          }
        );

        for await (const event of iter) {
          if (input.token?.cancelled && !parentCancel.token.cancelled) {
            parentCancel.cancel(input.token.reason ?? "client_disconnected");
          }
          if (parentCancel.token.cancelled || abort.signal.aborted) {
            attemptTerm = mapCancelReason(parentCancel.token.reason);
            clientOrInfra = true;
            await emit({
              type: "stream.cancelled",
              executionId: input.executionId,
              attemptId,
              providerId: candidate.providerId,
              modelId: candidate.modelId,
              capabilityId: String(input.request.capabilityId ?? "text.generate"),
              sequence: commit.state.lastSequence + 1,
              errorCode: attemptTerm,
              errorMessage: parentCancel.token.reason ?? "cancelled",
              at: this.nowIso(),
            });
            break;
          }

          if (this.nowMs() - startedMs > this.config.maxDurationMs) {
            attemptTerm = "max_duration";
            clientOrInfra = true;
            abort.abort("max_duration");
            break;
          }

          if (
            !commit.committed &&
            this.nowMs() - attemptStartedMs > firstOutputTimer
          ) {
            attemptTerm = "timeout";
            providerFailure = true;
            abort.abort("first_output_timeout");
            break;
          }

          if (
            commit.committed &&
            this.nowMs() - lastEventAt > this.config.idleTimeoutMs
          ) {
            attemptTerm = "idle_timeout";
            providerFailure = true;
            abort.abort("idle_timeout");
            break;
          }

          await emit(event);

          if (event.type === "stream.failed") {
            sawFail = true;
            attemptTerm = "provider_failed";
            providerFailure = true;
            break;
          }
          if (event.type === "stream.cancelled") {
            attemptTerm = mapCancelReason(event.errorCode);
            clientOrInfra = !providerFailure;
            break;
          }
          if (event.type === "tool.approval_required") {
            attemptTerm = "approval_required";
            success = true;
            break;
          }
          if (event.type === "stream.completed") {
            attemptTerm = "completed";
            success = true;
            break;
          }
        }
      } catch (err) {
        attemptTerm = "provider_failed";
        providerFailure = true;
        sawFail = true;
        await emit({
          type: "stream.failed",
          executionId: input.executionId,
          attemptId,
          providerId: candidate.providerId,
          modelId: candidate.modelId,
          capabilityId: String(input.request.capabilityId ?? "text.generate"),
          sequence: commit.state.lastSequence + 1,
          errorCode: "provider_throw",
          errorMessage: err instanceof Error ? err.message : String(err),
          at: this.nowIso(),
        });
      }

      const endedAt = this.nowIso();
      const evidence: StreamingAttemptEvidence = {
        attemptId,
        providerId: candidate.providerId,
        modelId: candidate.modelId,
        startedAt: attemptStarted,
        endedAt,
        firstOutputAt,
        committed: commit.committed,
        terminationReason: attemptTerm,
        providerFailure,
        clientOrInfraTermination: clientOrInfra,
        timeToFirstTokenMs: firstOutputAt
          ? Date.parse(firstOutputAt) - attemptStartedMs
          : undefined,
        streamDurationMs: this.nowMs() - attemptStartedMs,
        eventCount: commit.state.eventCount,
        charsEmitted: commit.state.charsEmitted,
        bytesEmitted: commit.state.bytesEmitted,
      };
      attempts.push(evidence);
      registry.unregister(input.executionId);

      if (success || attemptTerm === "approval_required") {
        terminationReason = attemptTerm;
        break;
      }

      if (clientOrInfra) {
        terminationReason = attemptTerm;
        break;
      }

      // Failover / retry decision
      if (mayFailoverOrRetry(commit.committed) && providerFailure) {
        const code = sawFail ? "fail_before_output" : attemptTerm;
        if (isRecoverablePreCommit(code) || attemptTerm === "timeout") {
          preCommitFailovers += 1;
          metrics?.onEnd({
            outcome: "failed",
            precommitFailover: true,
            durationMs: evidence.streamDurationMs,
            eventCount: evidence.eventCount,
            bytesEmitted: evidence.bytesEmitted,
          });
          metrics?.onStart();
          // Reset global assembler for next attempt (no committed output leaked).
          globalAssembler = new StreamOutputAssembler();
          continue;
        }
      }

      // Post-commit: terminate — never transparent failover.
      terminationReason = attemptTerm;
      break;
    }

    const result = this.terminal({
      executionId: input.executionId,
      success,
      terminationReason,
      streamCommitted,
      preCommitFailovers,
      attempts,
      assembler: globalAssembler,
      firstChunkLatencyMs,
      startedMs,
      events: emitted,
      organizationId: input.organizationId,
      capabilityId: String(input.request.capabilityId ?? "text.generate"),
    });

    const cancelled =
      terminationReason === "client_disconnected" ||
      terminationReason === "user_cancelled" ||
      terminationReason === "server_shutdown" ||
      terminationReason === "provider_cancelled";
    metrics?.onEnd({
      outcome: success ? "completed" : cancelled ? "cancelled" : "failed",
      committedFailure: streamCommitted && !success && !cancelled,
      ttftMs: firstChunkLatencyMs,
      durationMs: result.totalStreamDurationMs,
      eventCount: result.eventCount,
      bytesEmitted: attempts.reduce((n, a) => n + a.bytesEmitted, 0),
    });

    return result;
  }

  /** External cancel (client disconnect / shutdown). */
  static cancelReason(reason: string): CancellationToken {
    return { cancelled: true, reason };
  }

  private terminal(input: {
    executionId: string;
    success: boolean;
    terminationReason: StreamTerminationReason;
    streamCommitted: boolean;
    preCommitFailovers: number;
    attempts: readonly StreamingAttemptEvidence[];
    assembler: StreamOutputAssembler;
    firstChunkLatencyMs?: number;
    startedMs: number;
    events: readonly ProviderStreamEvent[];
    organizationId?: string;
    capabilityId?: string;
  }): StreamingExecutionResult {
    const snap = input.assembler.snapshot();
    let cost: CanonicalCostRecord | null = null;
    if (this.opts.costCalculator && snap.usage && input.attempts.length > 0) {
      const last = input.attempts[input.attempts.length - 1]!;
      cost = this.opts.costCalculator.calculate({
        providerId: last.providerId,
        modelId: last.modelId,
        capabilityId: input.capabilityId ?? "text.generate",
        usage: snap.usage as Readonly<Record<string, unknown>>,
        nowIso: this.nowIso(),
      });
    }

    return {
      executionId: input.executionId,
      success: input.success,
      terminationReason: input.terminationReason,
      streamCommitted: input.streamCommitted,
      preCommitFailovers: input.preCommitFailovers,
      attempts: input.attempts,
      finalContent: snap.content,
      finalReasoning: snap.reasoning,
      usageStatus: snap.usageStatus,
      usage: snap.usage,
      cost,
      toolCalls: snap.toolCalls,
      partial: snap.partial || !input.success,
      firstChunkLatencyMs: input.firstChunkLatencyMs,
      totalStreamDurationMs: this.nowMs() - input.startedMs,
      eventCount: input.events.length,
      events: input.events,
    };
  }
}

function mapCancelReason(reason?: string): StreamTerminationReason {
  const r = (reason ?? "").toLowerCase();
  if (r.includes("shutdown")) return "server_shutdown";
  if (r.includes("user")) return "user_cancelled";
  if (r.includes("disconnect") || r.includes("client")) return "client_disconnected";
  if (r.includes("provider")) return "provider_cancelled";
  return "client_disconnected";
}
