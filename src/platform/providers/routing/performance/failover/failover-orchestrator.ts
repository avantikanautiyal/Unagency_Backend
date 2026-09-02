/**
 * Executes routing.plan.primary then failoverChain on recoverable failure.
 * Provider-agnostic — no OpenAI/Anthropic branching.
 */

import { success, type Result } from "../../../../core/result";
import { asProviderId } from "../../../../core/identifiers";
import type { RoutingDecision } from "../../contracts/plan";
import type { ProviderExecutionRequest } from "../../../runtime/contracts/provider-execution-request";
import type { ProviderExecutionResult } from "../../../runtime/contracts/provider-execution-response";
import { EMPTY_EXECUTION_STATISTICS } from "../../../runtime/contracts/provider-execution-metadata";
import type { IProviderRuntime } from "../../../runtime/interfaces/provider-runtime";
import type { ICircuitBreakerRegistry } from "../../../runtime/interfaces/circuit-breaker";
import type { ProviderFailoverConfig } from "../config/adaptive-routing-config";
import {
  classifyExecutionFailure,
  shouldFailover,
} from "./failure-classification";
import { resolveExecutableModelId } from "./executable-model-id";
import type {
  FailoverExecutionOutcome,
  ProviderAttemptRecord,
} from "./failover-types";
import type { PerformanceFailureCategory } from "../contracts/performance-evidence";

export interface FailoverOrchestratorOptions {
  readonly runtime: IProviderRuntime;
  readonly failover: ProviderFailoverConfig;
  readonly circuitBreakers?: ICircuitBreakerRegistry;
  readonly nowIso?: () => string;
  readonly nowMs?: () => number;
  readonly createId?: (prefix: string) => string;
  /** Optional hook after each attempt (evidence writer). */
  readonly onAttempt?: (attempt: ProviderAttemptRecord, result: ProviderExecutionResult) => Promise<void>;
}

function attemptKey(providerId: string, modelId: string): string {
  return `${providerId}::${modelId}`;
}

export class FailoverOrchestrator {
  private readonly nowIso: () => string;
  private readonly nowMs: () => number;
  private readonly createId: (prefix: string) => string;

  constructor(private readonly opts: FailoverOrchestratorOptions) {
    this.nowIso = opts.nowIso ?? (() => new Date().toISOString());
    this.nowMs = opts.nowMs ?? (() => Date.now());
    this.createId =
      opts.createId ?? ((p) => `${p}_${Math.random().toString(36).slice(2)}`);
  }

  /**
   * Execute primary + failover chain from a routing decision.
   */
  async execute(
    baseRequest: ProviderExecutionRequest,
    decision: RoutingDecision
  ): Promise<Result<FailoverExecutionOutcome>> {
    const candidates = this.buildCandidateSequence(decision, baseRequest);
    return this.executeCandidates(baseRequest, candidates, {
      exploratory: Boolean(
        (decision.plan.primary as { exploratory?: boolean }).exploratory ??
          decision.warnings.some((w) => w.includes("exploratory"))
      ),
    });
  }

  /**
   * Execute an explicit ordered candidate list (tests / async failover).
   */
  async executeCandidates(
    baseRequest: ProviderExecutionRequest,
    candidates: readonly {
      providerId: string;
      modelId: string;
      primaryOrFailover: "primary" | "failover";
      positionInRoute: number;
    }[],
    meta?: { exploratory?: boolean }
  ): Promise<Result<FailoverExecutionOutcome>> {
    const attempts: ProviderAttemptRecord[] = [];
    const startedBudget = this.nowMs();
    let failoverCount = 0;
    let lastResult: ProviderExecutionResult | undefined;
    let budgetExhausted = false;
    const exploratory = Boolean(meta?.exploratory);

    if (!this.opts.failover.failoverEnabled) {
      const only = candidates[0];
      if (!only) {
        return success({
          result: this.syntheticFailure(baseRequest, "no_candidates", "no routing candidates"),
          attempts: [],
          finalProviderId: baseRequest.providerId,
          finalModelId: baseRequest.modelId ?? "unknown",
          attemptCount: 0,
          failoverCount: 0,
          budgetExhausted: true,
          exploratory,
        });
      }
      const single = await this.runOne(baseRequest, only, exploratory);
      attempts.push(single.attempt);
      if (this.opts.onAttempt) {
        await this.opts.onAttempt(single.attempt, single.result);
      }
      return success(this.wrapOutcome(single.result, attempts, 0, false, exploratory));
    }

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];

      if (attempts.length >= this.opts.failover.maxProviderAttempts) {
        budgetExhausted = true;
        break;
      }
      if (
        candidate.primaryOrFailover === "failover" &&
        failoverCount >= this.opts.failover.maxFailovers
      ) {
        budgetExhausted = true;
        break;
      }
      if (this.nowMs() - startedBudget > this.opts.failover.maxTotalLatencyMs) {
        budgetExhausted = true;
        break;
      }

      // Circuit-open: skip before execution (Scenario G).
      if (this.opts.circuitBreakers) {
        const breaker = this.opts.circuitBreakers.forProvider(
          asProviderId(candidate.providerId)
        );
        if (!breaker.canDispatch()) {
          const skipped = this.skippedCircuitOpen(candidate, exploratory);
          attempts.push(skipped);
          // Treat as recoverable failure for failover progression.
          if (!shouldFailover("circuit_open")) break;
          if (candidate.primaryOrFailover === "failover") failoverCount += 1;
          continue;
        }
      }

      const elapsed = this.nowMs() - startedBudget;
      const remaining = Math.max(
        0,
        this.opts.failover.maxTotalLatencyMs - elapsed
      );
      const candidatesLeft = candidates.length - i;
      const perAttemptMs = Math.min(
        baseRequest.timeoutPolicy?.executionTimeoutMs ?? 120_000,
        Math.max(
          45_000,
          Math.floor(remaining / Math.max(1, candidatesLeft))
        )
      );

      const requestForAttempt: ProviderExecutionRequest = {
        ...baseRequest,
        timeoutPolicy: {
          ...baseRequest.timeoutPolicy,
          executionTimeoutMs: perAttemptMs,
          streamingTimeoutMs: perAttemptMs,
        },
        retryPolicy: {
          ...baseRequest.retryPolicy,
          maxAttempts: 1,
        },
      };

      const ran = await this.runOne(requestForAttempt, candidate, exploratory);
      attempts.push(ran.attempt);
      lastResult = ran.result;
      if (this.opts.onAttempt) {
        await this.opts.onAttempt(ran.attempt, ran.result);
      }

      if (ran.result.success) {
        if (failoverCount > 0 || attempts.length > 1) {
          console.log(
            [
              "⚙️  [Direct] failover succeeded",
              `provider=${candidate.providerId}`,
              `model=${candidate.modelId}`,
              `attempts=${attempts.length}`,
              `failovers=${failoverCount}`,
            ].join(" | ")
          );
        }
        return success(
          this.wrapOutcome(ran.result, attempts, failoverCount, false, exploratory)
        );
      }

      const category = ran.attempt.failureCategory;
      const recoverable = shouldFailover(category);
      if (!recoverable) {
        console.log(
          [
            "⚙️  [Direct] provider failed (no failover)",
            `provider=${candidate.providerId}`,
            `category=${category}`,
            `error=${ran.attempt.errorMessage ?? "n/a"}`,
          ].join(" | ")
        );
        return success(
          this.wrapOutcome(ran.result, attempts, failoverCount, false, exploratory)
        );
      }

      console.log(
        [
          "⚙️  [Direct] provider failed → failover",
          `provider=${candidate.providerId}`,
          `category=${category}`,
          `error=${ran.attempt.errorMessage ?? "n/a"}`,
        ].join(" | ")
      );

      if (candidate.primaryOrFailover === "failover" || i > 0) {
        // Count failovers after primary failure path.
      }
      if (i === 0) {
        // primary failed recoverably — next iterations are failovers
      } else {
        failoverCount += 1;
      }

      // Prepare for next candidate
      if (i === 0) {
        // after primary failure, subsequent are failovers — failoverCount increments when we start them
      }
    }

    // Adjust failoverCount: number of failover attempts that ran
    const actualFailovers = attempts.filter((a) => a.primaryOrFailover === "failover").length;

    if (!lastResult) {
      lastResult = this.syntheticFailure(
        baseRequest,
        "FAILOVER_BUDGET",
        budgetExhausted ? "failover budget exhausted" : "all providers failed"
      );
    }

    return success(
      this.wrapOutcome(
        lastResult,
        attempts,
        actualFailovers,
        budgetExhausted || attempts.length >= this.opts.failover.maxProviderAttempts,
        exploratory
      )
    );
  }

  buildCandidateSequence(
    decision: RoutingDecision,
    baseRequest: ProviderExecutionRequest
  ): {
    providerId: string;
    modelId: string;
    primaryOrFailover: "primary" | "failover";
    positionInRoute: number;
  }[] {
    const seen = new Set<string>();
    const out: {
      providerId: string;
      modelId: string;
      primaryOrFailover: "primary" | "failover";
      positionInRoute: number;
    }[] = [];

    const push = (
      providerId: string,
      modelId: string | undefined,
      role: "primary" | "failover"
    ) => {
      const mid = resolveExecutableModelId(
        providerId,
        modelId ?? baseRequest.modelId
      );
      const key = attemptKey(providerId, mid);
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        providerId,
        modelId: mid,
        primaryOrFailover: role,
        positionInRoute: out.length,
      });
    };

    push(
      String(decision.plan.primary.providerId),
      decision.plan.primary.modelId ? String(decision.plan.primary.modelId) : undefined,
      "primary"
    );

    for (const step of decision.plan.failoverChain) {
      // order 0 is typically primary — skip duplicates
      const pid = String(step.providerId);
      const mid = step.modelId ? String(step.modelId) : undefined;
      if (
        pid === String(decision.plan.primary.providerId) &&
        (mid ?? "") === (decision.plan.primary.modelId ? String(decision.plan.primary.modelId) : "")
      ) {
        continue;
      }
      push(pid, mid, "failover");
    }

    // Also consider explicit fallbacks list
    for (const fb of decision.plan.fallbacks) {
      push(
        String(fb.providerId),
        fb.modelId ? String(fb.modelId) : undefined,
        "failover"
      );
    }

    return out;
  }

  private async runOne(
    baseRequest: ProviderExecutionRequest,
    candidate: {
      providerId: string;
      modelId: string;
      primaryOrFailover: "primary" | "failover";
      positionInRoute: number;
    },
    exploratory: boolean
  ): Promise<{ attempt: ProviderAttemptRecord; result: ProviderExecutionResult }> {
    const attemptId = this.createId("attempt");
    const startedAt = this.nowIso();
    const startedMs = this.nowMs();
    const providerId = asProviderId(candidate.providerId);
    const modelId = resolveExecutableModelId(candidate.providerId, candidate.modelId);

    const request: ProviderExecutionRequest = {
      ...baseRequest,
      requestId: `${baseRequest.requestId}_${candidate.positionInRoute}`,
      providerId,
      modelId,
      context: {
        ...baseRequest.context,
        providerId,
      },
    };

    const executed = await this.opts.runtime.execute(request);
    const completedAt = this.nowIso();
    const latencyMs = Math.max(0, this.nowMs() - startedMs);

    let result: ProviderExecutionResult;
    if (!executed.ok) {
      result = this.syntheticFailure(
        request,
        executed.error.code,
        executed.error.message
      );
    } else {
      result = executed.value;
    }

    const failureCategory: PerformanceFailureCategory = result.success
      ? "none"
      : classifyExecutionFailure({
          status: result.status,
          error: result.error,
        });

    const attempt: ProviderAttemptRecord = {
      attemptId,
      positionInRoute: candidate.positionInRoute,
      primaryOrFailover: candidate.primaryOrFailover,
      providerId: candidate.providerId,
      modelId,
      success: result.success,
      failureCategory,
      latencyMs,
      startedAt,
      completedAt,
      status: result.status,
      errorCode: result.error?.code,
      errorMessage: result.error?.message
        ? result.error.message.slice(0, 240)
        : undefined,
      exploratory: exploratory || undefined,
    };

    return { attempt, result };
  }

  private skippedCircuitOpen(
    candidate: {
      providerId: string;
      modelId: string;
      primaryOrFailover: "primary" | "failover";
      positionInRoute: number;
    },
    exploratory: boolean
  ): ProviderAttemptRecord {
    const now = this.nowIso();
    return {
      attemptId: this.createId("attempt"),
      positionInRoute: candidate.positionInRoute,
      primaryOrFailover: candidate.primaryOrFailover,
      providerId: candidate.providerId,
      modelId: candidate.modelId,
      success: false,
      failureCategory: "circuit_open",
      latencyMs: 0,
      startedAt: now,
      completedAt: now,
      status: "failed",
      errorCode: "CIRCUIT_OPEN",
      errorMessage: "circuit breaker is open — skipped before execution",
      exploratory: exploratory || undefined,
    };
  }

  private syntheticFailure(
    request: ProviderExecutionRequest,
    code: string,
    message: string
  ): ProviderExecutionResult {
    return {
      requestId: request.requestId,
      sessionId: `synth_${request.requestId}`,
      status: "failed",
      success: false,
      error: { code, message },
      statistics: { ...EMPTY_EXECUTION_STATISTICS },
      completedAt: this.nowIso(),
    };
  }

  private wrapOutcome(
    result: ProviderExecutionResult,
    attempts: readonly ProviderAttemptRecord[],
    failoverCount: number,
    budgetExhausted: boolean,
    exploratory: boolean
  ): FailoverExecutionOutcome {
    const final = attempts.filter((a) => a.success).slice(-1)[0] ?? attempts[attempts.length - 1];
    const enriched: ProviderExecutionResult = {
      ...result,
      attemptHistory: attempts,
      finalProviderId: final?.providerId ?? String(result.response?.providerId ?? ""),
      finalModelId: final?.modelId,
      failoverCount,
      budgetExhausted,
    };

    return {
      result: enriched,
      attempts,
      finalProviderId: final?.providerId ?? result.response?.providerId ?? "unknown",
      finalModelId: final?.modelId ?? "unknown",
      attemptCount: attempts.length,
      failoverCount,
      budgetExhausted,
      exploratory,
    };
  }
}
