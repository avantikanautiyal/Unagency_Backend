/**
 * Async provider runtime facade — submit + reconcile without blocking workers.
 */

import type { CancellationToken } from "../../runtime/contracts/cancellation";
import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import type { Result } from "../../../core/result";
import type { IAsyncProviderDispatcher } from "../interfaces/async-provider-dispatcher";
import type { ProviderOperationRecord } from "../contracts/provider-operation";
import { isTerminalProviderOperationState } from "../contracts/provider-operation-state";
import { AsyncProviderOrchestrator, type AsyncSubmitOutcome } from "../orchestration/async-provider-orchestrator";
import { ProviderOperationReconciler } from "../reconciliation/provider-operation-reconciler";
import type { IProviderOperationStore } from "../interfaces/provider-operation-store";
import type { MediaIngestionService } from "../../../media/ingestion/media-ingestion-service";
import type { MediaArtifactService } from "../../../media/artifacts/media-artifact-service";
import type { ITenantUsageStore } from "../../../infrastructure/durability/interfaces/execution-store-ports";

export interface AsyncProviderRuntimeOptions {
  readonly store: IProviderOperationStore;
  readonly ingestion: MediaIngestionService;
  readonly artifacts: MediaArtifactService;
  readonly usageStore?: ITenantUsageStore;
  readonly blobAccess?: import("../../../media/blob/blob-access-service").BlobAccessService;
  readonly blobStorage?: import("../../../persistence/interfaces/persistence").IBlobStorage;
  readonly blobMetadata?: import("../../../media/blob/blob-metadata-repository").IBlobMetadataRepository;
  readonly leaseTtlMs?: number;
  readonly maxOperationDurationMs?: number;
}

export class AsyncProviderRuntime {
  private readonly orchestrator: AsyncProviderOrchestrator;
  private readonly reconciler: ProviderOperationReconciler;

  constructor(private readonly deps: AsyncProviderRuntimeOptions) {
    this.orchestrator = new AsyncProviderOrchestrator({
      store: deps.store,
      blobAccess: deps.blobAccess,
      maxOperationDurationMs: deps.maxOperationDurationMs,
    });
    this.reconciler = new ProviderOperationReconciler({
      store: deps.store,
      ingestion: deps.ingestion,
      artifacts: deps.artifacts,
      usageStore: deps.usageStore,
      blobStorage: deps.blobStorage,
      blobMetadata: deps.blobMetadata,
      blobAccess: deps.blobAccess,
      leaseTtlMs: deps.leaseTtlMs,
      maxOperationDurationMs: deps.maxOperationDurationMs,
    });
  }

  submit(
    dispatcher: IAsyncProviderDispatcher,
    request: ProviderExecutionRequest,
    token: CancellationToken,
    attemptId: string
  ): Promise<Result<AsyncSubmitOutcome>> {
    return this.orchestrator.submit(dispatcher, request, token, attemptId);
  }

  reconcile(
    workerId: string,
    resolveDispatcher:
      | IAsyncProviderDispatcher
      | ((op: ProviderOperationRecord) => IAsyncProviderDispatcher | undefined),
    buildRequest: (op: ProviderOperationRecord) => ProviderExecutionRequest,
    token: CancellationToken,
    limit?: number,
    asOfMs?: number
  ): Promise<Result<{ processed: number }>> {
    const resolver =
      typeof resolveDispatcher === "function"
        ? resolveDispatcher
        : (_op: ProviderOperationRecord) => resolveDispatcher;
    return this.reconciler.tick(workerId, resolver, buildRequest, token, limit, asOfMs);
  }

  async runToCompletion(
    workerId: string,
    resolveDispatcher:
      | IAsyncProviderDispatcher
      | ((op: ProviderOperationRecord) => IAsyncProviderDispatcher | undefined),
    buildRequest: (op: ProviderOperationRecord) => ProviderExecutionRequest,
    token: CancellationToken,
    maxTicks = 100
  ): Promise<void> {
    for (let i = 0; i < maxTicks; i += 1) {
      // Use real time for reconcile age/budget. Force-due only for listDueForPoll
      // so tests can drain nextPollAt without falsifying provider_poll_max_duration.
      const nowMs = Date.now();
      const dueAsOf = nowMs + 86_400_000;
      const tick = await this.reconcile(
        workerId,
        resolveDispatcher,
        buildRequest,
        token,
        20,
        nowMs,
      );
      if (!tick.ok) throw tick.error;
      const due = await this.deps.store.listDueForPoll(dueAsOf, 500);
      const stillRunning = due.some((o) => !isTerminalProviderOperationState(o.state));
      if (!stillRunning) break;
      await sleep(5);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
