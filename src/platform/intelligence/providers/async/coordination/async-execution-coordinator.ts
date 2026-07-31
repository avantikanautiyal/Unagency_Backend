/**
 * Async execution HTTP bridge — resolves async dispatcher from runtime registry.
 * Production never hardcodes FakeAsyncProviderDispatcher.
 */

import { failure, success, type Result } from "../../../shared/result";
import { ValidationError } from "../../../shared/errors";
import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import type { CancellationToken } from "../../runtime/contracts/cancellation";
import {
  isAsyncProviderDispatcher,
  type IAsyncProviderDispatcher,
} from "../interfaces/async-provider-dispatcher";
import type { AsyncProviderRuntime } from "../runtime/async-provider-runtime";
import type { IProviderOperationStore } from "../interfaces/provider-operation-store";
import type {
  ExecutionDiagnostics,
  ExecutionResource,
} from "../../../../api/contracts";
import type {
  IArtifactRepository,
  IExecutionExtrasRepository,
  IExecutionRepository,
  ITenantUsageStore,
} from "../../../../infrastructure/durability/interfaces/execution-store-ports";
import { mapProviderOperationToExecutionStatus } from "./map-operation-status";
import { buildExecutionIntelligenceSnapshot } from "../../../../api/execution-intelligence/projection/build-snapshot";
import type { ExecutionIntelligenceSnapshot } from "../../../../api/execution-intelligence";
import {
  asCapabilityId,
  asExecutionId,
  asOrganizationId,
  asProviderId,
  asWorkspaceId,
} from "../../../shared/identifiers";
import type { IProviderRuntimeRegistry } from "../../runtime/registry/in-memory-provider-runtime-registry";
import { isVideoGenerationCapability, isAsyncMediaCapability } from "../../common/resolve-execution-modality";
import type { AsyncFailoverOrchestrator } from "../../routing/performance/failover/async-failover-orchestrator";
import { parseFailoverChainFromPayload } from "../../routing/performance/failover/async-failover-orchestrator";

export interface AsyncExecutionCoordinatorOptions {
  readonly runtime: AsyncProviderRuntime;
  readonly store: IProviderOperationStore;
  readonly executions: IExecutionRepository;
  readonly artifacts: IArtifactRepository;
  readonly extras: IExecutionExtrasRepository;
  readonly tenantUsage?: ITenantUsageStore;
  /** Production: resolve async leaves from registry by routed providerId. */
  readonly registry?: IProviderRuntimeRegistry;
  /**
   * Test/dev only — when set AND allowFakeDispatcher=true, used as fallback.
   * Must never be the sole production LIVE path.
   */
  readonly dispatcher?: IAsyncProviderDispatcher;
  readonly allowFakeDispatcher?: boolean;
  readonly nowIso: () => string;
  readonly createId: (prefix: string) => string;
  readonly onIntelligenceSnapshot?: (snap: ExecutionIntelligenceSnapshot) => void;
  /** M9.5H — optional async failover after terminal provider failure. */
  readonly asyncFailover?: AsyncFailoverOrchestrator;
}

export class AsyncExecutionCoordinator {
  constructor(private readonly deps: AsyncExecutionCoordinatorOptions) {}

  async submitExecution(input: {
    executionId: string;
    organizationId: string;
    workspaceId?: string;
    prompt: string;
    correlationId: string;
    attemptId?: string;
    providerId: string;
    modelId: string;
    capabilityId: string;
    payload?: Readonly<Record<string, unknown>>;
  }): Promise<Result<{ operationId: string; providerJobId?: string }>> {
    const dispatcher = this.resolveDispatcher(input.providerId);
    if (!dispatcher) {
      return failure(
        new ValidationError(
          `No executable async video provider for ${input.providerId} — verify adapter + credentials`
        )
      );
    }

    const attemptId = input.attemptId ?? this.deps.createId("attempt");
    const request = this.buildRequest(input);
    const token: CancellationToken = { cancelled: false, reason: undefined };
    const submit = await this.deps.runtime.submit(dispatcher, request, token, attemptId);
    if (!submit.ok) return submit;
    return success({
      operationId: submit.value.operation.operationId,
      providerJobId: submit.value.operation.providerJobId,
    });
  }

  async reconcileExecution(executionId: string): Promise<Result<ExecutionResource | undefined>> {
    const op = await this.findOperationForExecution(executionId);
    if (!op) return success(undefined);

    const dispatcher = this.resolveDispatcher(op.providerId);
    if (!dispatcher) {
      return failure(new ValidationError(`Async dispatcher unavailable for ${op.providerId}`));
    }

    const token: CancellationToken = { cancelled: false, reason: undefined };
    await this.deps.runtime.reconcile(
      "async-http-bridge",
      (record) => this.resolveDispatcher(record.providerId),
      (record) =>
        this.buildRequest({
          executionId: record.executionId,
          organizationId: record.organizationId,
          workspaceId: record.workspaceId,
          prompt: "async execution",
          correlationId: record.executionId,
          providerId: record.providerId,
          modelId: record.modelId,
          capabilityId: record.capabilityId,
        }),
      token,
      5,
      Date.now() + 86_400_000
    );

    const refreshed = await this.deps.store.get(op.operationId);
    if (!refreshed) return success(undefined);

    const execution = await this.deps.executions.get(executionId);
    if (!execution) return success(undefined);

    const status = mapProviderOperationToExecutionStatus(refreshed.state);
    const artifactIds = refreshed.artifactIds ?? [];
    const result =
      status === "succeeded" && artifactIds.length > 0
        ? {
            kind: "artifact" as const,
            data: { artifactIds: [...artifactIds] },
          }
        : status === "waiting_provider" || status === "processing_result" || status === "queued" || status === "running"
          ? { kind: "pending" as const }
          : status === "failed" || status === "cancelled"
            ? execution.result
            : execution.result;

    const updated: ExecutionResource = {
      ...execution,
      status,
      updatedAt: this.deps.nowIso(),
      completedAt:
        status === "succeeded" || status === "failed" || status === "cancelled"
          ? refreshed.terminalAt ?? this.deps.nowIso()
          : execution.completedAt,
      errorMessage: refreshed.errorMessage ?? execution.errorMessage,
      artifactIds: artifactIds.length > 0 ? [...artifactIds] : execution.artifactIds,
      result: result ?? execution.result,
    };
    await this.deps.executions.update(updated);

    const diagnostics = this.buildDiagnostics(refreshed);
    const existingExtras = await this.deps.extras.get(executionId);
    await this.deps.extras.save(executionId, execution.organizationId, {
      diagnostics,
      trace: existingExtras?.trace ?? {
        executionId,
        correlationId: execution.correlationId,
        stages: ["async_provider"],
        durationMs: 0,
      },
      cost: existingExtras?.cost ?? {
        executionId,
        amount: null,
        currency: null,
        status: "unknown" as const,
        providerId: refreshed.providerId,
        modelId: refreshed.modelId,
      },
      evaluation: existingExtras?.evaluation ?? {
        executionId,
        score: null,
        humanReviewRequired: false,
      },
      experience: existingExtras?.experience ?? {
        executionId,
        experienceIds: [],
        applied: false,
      },
    });

    if (status === "succeeded" || status === "failed") {
      const snap = buildExecutionIntelligenceSnapshot({
        execution: updated,
        metadata: {
          provider: refreshed.providerId,
          model: refreshed.modelId,
          capabilityId: refreshed.capabilityId,
          pollCount: refreshed.pollCount,
          providerJobId: refreshed.providerJobId,
          artifactIds: refreshed.artifactIds,
          asyncExecution: true,
          totalTokens: refreshed.usage?.totalTokens ?? refreshed.usage?.computeUnits,
          attemptHistory: (await this.deps.store.listByExecutionId(executionId)).map((o) => ({
            providerId: o.providerId,
            modelId: o.modelId,
            state: o.state,
            attemptId: o.attemptId,
            failureCategory: o.errorCode,
          })),
        },
        nowIso: this.deps.nowIso,
      });
      this.deps.onIntelligenceSnapshot?.(snap);
    }

    // M9.5H — async failover only after terminal provider failure (never while pending).
    if (status === "failed" && this.deps.asyncFailover) {
      const chain = parseFailoverChainFromPayload(
        (refreshed.safeMetadata ?? {}) as Record<string, unknown>
      );
      if (chain.length > 0) {
        const fo = await this.deps.asyncFailover.maybeFailover({
          executionId,
          organizationId: refreshed.organizationId,
          workspaceId: refreshed.workspaceId,
          prompt: "async execution",
          correlationId: execution.correlationId,
          capabilityId: refreshed.capabilityId,
          failoverChain: chain,
          payload: refreshed.safeMetadata,
          routingDecisionId:
            typeof refreshed.safeMetadata?.routingDecisionId === "string"
              ? refreshed.safeMetadata.routingDecisionId
              : undefined,
        });
        if (fo.ok && fo.value.submitted) {
          const waiting: ExecutionResource = {
            ...updated,
            status: "waiting_provider",
            errorMessage: undefined,
            updatedAt: this.deps.nowIso(),
            completedAt: undefined,
          };
          await this.deps.executions.update(waiting);
          return success(waiting);
        }
      }
    }

    return success(updated);
  }

  private resolveDispatcher(providerId: string): IAsyncProviderDispatcher | undefined {
    if (this.deps.registry) {
      const entry = this.deps.registry.resolveAvailable(asProviderId(providerId));
      if (entry?.dispatcher && isAsyncProviderDispatcher(entry.dispatcher)) {
        return entry.dispatcher;
      }
    }
    if (this.deps.allowFakeDispatcher && this.deps.dispatcher) {
      return this.deps.dispatcher;
    }
    return undefined;
  }

  private buildDiagnostics(op: {
    operationId: string;
    executionId: string;
    providerId: string;
    modelId: string;
    state: string;
    providerJobId?: string;
    pollCount: number;
    submittedAt?: string;
    lastPolledAt?: string;
    nextPollAt?: string;
    artifactIds?: readonly string[];
  }): ExecutionDiagnostics {
    return {
      executionId: op.executionId,
      generatedAt: this.deps.nowIso(),
      stages: [{ stage: "async_provider", status: op.state === "failed" ? "error" : "ok" }],
      executionMode: "async",
      provider: op.providerId,
      model: op.modelId,
      providerOperationId: op.operationId,
      providerJobId: op.providerJobId,
      providerOperationState: op.state,
      pollCount: op.pollCount,
      submittedAt: op.submittedAt,
      lastPolledAt: op.lastPolledAt,
      nextPollAt: op.nextPollAt,
      artifactId: op.artifactIds?.[0],
    } as ExecutionDiagnostics;
  }

  private async findOperationForExecution(executionId: string) {
    return this.deps.store.getByExecutionId(executionId);
  }

  private buildRequest(input: {
    executionId: string;
    organizationId: string;
    workspaceId?: string;
    prompt: string;
    correlationId: string;
    providerId: string;
    modelId: string;
    capabilityId: string;
    payload?: Readonly<Record<string, unknown>>;
  }): ProviderExecutionRequest {
    return {
      requestId: this.deps.createId("preq"),
      providerId: asProviderId(input.providerId),
      capabilityId: asCapabilityId(input.capabilityId),
      modelId: input.modelId,
      payload: input.payload ?? { prompt: input.prompt },
      context: {
        executionId: asExecutionId(input.executionId),
        organizationId: asOrganizationId(input.organizationId),
        workspaceId: asWorkspaceId(input.workspaceId ?? "ws_default"),
        providerId: asProviderId(input.providerId),
        planId: "plan_default",
        correlationId: input.correlationId,
      },
      retryPolicy: { strategy: "none", maxAttempts: 1, baseDelayMs: 0 },
      timeoutPolicy: { executionTimeoutMs: 3_600_000 },
      streaming: false,
      priority: 0,
      createdAt: this.deps.nowIso(),
    };
  }
}

/**
 * Production: async path is derived from capability + registry semantics.
 * Client metadata.useFakeAsyncProvider is ignored in production (NODE_ENV=production).
 * Tests/dev may still opt into fake via allowFakeDispatcher composition.
 * M10.6: image.generate and video.generate use async media when coordinator is present.
 */
export function isAsyncExecutionRequest(input: {
  capabilityId?: string;
  metadata?: Readonly<Record<string, unknown>>;
  hasAsyncCoordinator: boolean;
  executionMode?: string;
}): boolean {
  if (!input.hasAsyncCoordinator) return false;

  const cap = input.capabilityId ?? "";
  if (isAsyncMediaCapability(cap)) return true;

  // Non-production test/dev escape hatch only
  if (process.env.NODE_ENV === "production") return false;
  return (
    input.metadata?.asyncExecution === true || input.metadata?.useFakeAsyncProvider === true
  );
}
