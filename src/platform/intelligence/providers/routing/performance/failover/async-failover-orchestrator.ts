/**
 * Async failover — only after terminal provider failure (never while pending).
 * Conservative paid-job budget via PROVIDER_FAILOVER_MAX_SUBMITTED_PAID_JOBS.
 */

import { failure, success, type Result } from "../../../../shared/result";
import type { AsyncExecutionCoordinator } from "../../../async/coordination/async-execution-coordinator";
import type { IProviderOperationStore } from "../../../async/interfaces/provider-operation-store";
import type { ProviderOperationRecord } from "../../../async/contracts/provider-operation";
import {
  classifyExecutionFailure,
  shouldFailover,
} from "./failure-classification";
import type { ProviderFailoverConfig } from "../config/adaptive-routing-config";
import type { PerformanceEvidenceWriter } from "../feedback/performance-evidence-writer";
import type { ProviderAttemptRecord } from "./failover-types";
import { EMPTY_EXECUTION_STATISTICS } from "../../../runtime/contracts/provider-execution-metadata";

export interface AsyncFailoverCandidate {
  readonly providerId: string;
  readonly modelId: string;
}

export interface AsyncFailoverOrchestratorOptions {
  readonly submitFailover: AsyncExecutionCoordinator["submitExecution"];
  readonly store: IProviderOperationStore;
  readonly failover: ProviderFailoverConfig;
  readonly evidenceWriter?: PerformanceEvidenceWriter;
  readonly nowIso: () => string;
  readonly createId: (prefix: string) => string;
}

/**
 * If the latest operation for an execution is terminally failed with a
 * recoverable category, submit the next failover candidate (once per failure).
 */
export class AsyncFailoverOrchestrator {
  constructor(private readonly opts: AsyncFailoverOrchestratorOptions) {}

  async maybeFailover(input: {
    executionId: string;
    organizationId: string;
    workspaceId?: string;
    prompt: string;
    correlationId: string;
    capabilityId: string;
    failoverChain: readonly AsyncFailoverCandidate[];
    payload?: Readonly<Record<string, unknown>>;
    routingDecisionId?: string;
  }): Promise<
    Result<{
      submitted: boolean;
      operationId?: string;
      providerId?: string;
      modelId?: string;
      reason?: string;
    }>
  > {
    if (!this.opts.failover.failoverEnabled) {
      return success({ submitted: false, reason: "failover_disabled" });
    }

    const ops = await this.listOpsForExecution(input.executionId);
    const terminalFailed = ops.filter((o) => o.state === "failed");
    const nonTerminal = ops.filter(
      (o) =>
        o.state === "pending" ||
        o.state === "submitted" ||
        o.state === "completed" ||
        o.state === "result_ingesting"
    );

    // Never failover while still processing.
    if (nonTerminal.length > 0) {
      return success({ submitted: false, reason: "still_processing" });
    }

    if (terminalFailed.length === 0) {
      return success({ submitted: false, reason: "no_terminal_failure" });
    }

    const latest = terminalFailed.sort((a, b) =>
      (a.terminalAt ?? a.updatedAt) < (b.terminalAt ?? b.updatedAt) ? 1 : -1
    )[0];

    const category = classifyExecutionFailure({
      error: latest.errorCode
        ? { code: latest.errorCode, message: latest.errorMessage ?? "" }
        : undefined,
      message: latest.errorMessage,
    });

    if (!shouldFailover(category)) {
      return success({ submitted: false, reason: `no_failover_for_${category}` });
    }

    const submittedCount = ops.filter(
      (o) => o.state !== "failed" || Boolean(o.providerJobId)
    ).length;
    // Count distinct paid submissions (any op that reached submitted/pending with job id).
    const paidSubmits = ops.filter((o) => Boolean(o.providerJobId) || o.submittedAt).length;
    if (paidSubmits >= this.opts.failover.maxSubmittedPaidJobs) {
      return success({ submitted: false, reason: "max_submitted_paid_jobs" });
    }
    if (terminalFailed.length > this.opts.failover.maxFailovers) {
      return success({ submitted: false, reason: "max_failovers" });
    }
    if (ops.length >= this.opts.failover.maxProviderAttempts) {
      return success({ submitted: false, reason: "max_provider_attempts" });
    }

    const tried = new Set(ops.map((o) => `${o.providerId}::${o.modelId}`));
    const next = input.failoverChain.find(
      (c) => !tried.has(`${c.providerId}::${c.modelId}`)
    );
    if (!next) {
      return success({ submitted: false, reason: "failover_chain_exhausted" });
    }

    // Record failed attempt evidence
    if (this.opts.evidenceWriter) {
      const attempt: ProviderAttemptRecord = {
        attemptId: latest.attemptId,
        positionInRoute: terminalFailed.length - 1,
        primaryOrFailover: terminalFailed.length === 1 ? "primary" : "failover",
        providerId: latest.providerId,
        modelId: latest.modelId,
        success: false,
        failureCategory: category,
        latencyMs: 0,
        startedAt: latest.submittedAt ?? latest.createdAt,
        completedAt: latest.terminalAt ?? latest.updatedAt,
        status: "failed",
        errorCode: latest.errorCode,
        errorMessage: latest.errorMessage?.slice(0, 240),
      };
      await this.opts.evidenceWriter.recordAttempt(
        attempt,
        {
          requestId: latest.executionId,
          sessionId: latest.operationId,
          status: "failed",
          success: false,
          error: {
            code: latest.errorCode ?? "PROVIDER_ERROR",
            message: latest.errorMessage ?? "async provider failed",
          },
          statistics: { ...EMPTY_EXECUTION_STATISTICS, attempts: 1 },
          completedAt: attempt.completedAt,
        },
        {
          executionId: input.executionId,
          organizationId: input.organizationId,
          capabilityId: input.capabilityId,
          routingDecisionId: input.routingDecisionId,
          createId: this.opts.createId,
          nowIso: this.opts.nowIso,
        }
      );
    }

    const submit = await this.opts.submitFailover({
      executionId: input.executionId,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      prompt: input.prompt,
      correlationId: input.correlationId,
      providerId: next.providerId,
      modelId: next.modelId,
      capabilityId: input.capabilityId,
      payload: {
        ...input.payload,
        asyncFailoverFrom: latest.providerId,
        asyncFailoverCategory: category,
      },
      attemptId: this.opts.createId("attempt"),
    });

    if (!submit.ok) return submit;

    void submittedCount;
    return success({
      submitted: true,
      operationId: submit.value.operationId,
      providerId: next.providerId,
      modelId: next.modelId,
    });
  }

  private async listOpsForExecution(
    executionId: string
  ): Promise<readonly ProviderOperationRecord[]> {
    const store = this.opts.store as IProviderOperationStore & {
      listByExecutionId?: (id: string) => Promise<readonly ProviderOperationRecord[]>;
    };
    if (typeof store.listByExecutionId === "function") {
      return store.listByExecutionId(executionId);
    }
    const one = await this.opts.store.getByExecutionId(executionId);
    return one ? [one] : [];
  }
}

export function parseFailoverChainFromPayload(
  payload: Readonly<Record<string, unknown>> | undefined
): AsyncFailoverCandidate[] {
  const raw = payload?.failoverChain;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      const r = row as Record<string, unknown>;
      if (typeof r.providerId === "string" && typeof r.modelId === "string") {
        return { providerId: r.providerId, modelId: r.modelId };
      }
      return undefined;
    })
    .filter((x): x is AsyncFailoverCandidate => Boolean(x));
}
