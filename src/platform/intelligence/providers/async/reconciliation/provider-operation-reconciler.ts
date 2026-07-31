/**
 * Durable provider operation reconciliation worker.
 */

import { failure, success, type Result } from "../../../shared/result";
import { ValidationError } from "../../../shared/errors";
import type { CancellationToken } from "../../runtime/contracts/cancellation";
import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import type { IAsyncProviderDispatcher } from "../interfaces/async-provider-dispatcher";
import type { IProviderOperationStore } from "../interfaces/provider-operation-store";
import { transitionOperation } from "../interfaces/provider-operation-store";
import type { ProviderOperationRecord } from "../contracts/provider-operation";
import { isTerminalProviderOperationState } from "../contracts/provider-operation-state";
import type { MediaIngestionService } from "../../../../media/ingestion/media-ingestion-service";
import type { MediaArtifactService } from "../../../../media/artifacts/media-artifact-service";
import type { ITenantUsageStore } from "../../../../infrastructure/durability/interfaces/execution-store-ports";
import { sanitizeOutputsForPersistence } from "../persistence/sanitize-operation-record";

export interface ProviderOperationReconcilerOptions {
  readonly store: IProviderOperationStore;
  readonly ingestion: MediaIngestionService;
  readonly artifacts: MediaArtifactService;
  readonly usageStore?: ITenantUsageStore;
  readonly leaseTtlMs?: number;
  readonly maxOperationDurationMs?: number;
  readonly defaultPollBackoffMs?: number;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
}

export class ProviderOperationReconciler {
  private readonly nowIso: () => string;
  private readonly clockMs: () => number;

  constructor(private readonly deps: ProviderOperationReconcilerOptions) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.clockMs = deps.clockMs ?? (() => Date.now());
  }

  async tick(
    workerId: string,
    resolveDispatcher: (
      op: ProviderOperationRecord
    ) => IAsyncProviderDispatcher | undefined,
    buildRequest: (op: ProviderOperationRecord) => ProviderExecutionRequest,
    token: CancellationToken,
    limit = 10,
    asOfMs?: number
  ): Promise<Result<{ processed: number }>> {
    const nowMs = asOfMs ?? this.clockMs();
    await this.deps.store.reclaimExpiredLeases(this.nowIso(), nowMs);

    const due = await this.deps.store.listDueForPoll(nowMs, limit);
    let processed = 0;

    for (const op of due) {
      if (isTerminalProviderOperationState(op.state)) continue;

      const maxDur = this.deps.maxOperationDurationMs ?? 3_600_000;
      if (Date.now() - Date.parse(op.createdAt) > maxDur) {
        await this.deps.store.update(
          transitionOperation(op, "failed", this.nowIso(), {
            errorCode: "provider_job_timeout",
            errorMessage: "async provider operation exceeded max duration",
            terminalAt: this.nowIso(),
          })
        );
        processed++;
        continue;
      }

      const claimed = await this.deps.store.tryClaim(
        op.operationId,
        workerId,
        this.deps.leaseTtlMs ?? 30_000,
        this.nowIso(),
        this.clockMs()
      );
      if (!claimed) continue;

      const dispatcher = resolveDispatcher(claimed);
      if (!dispatcher) {
        await this.deps.store.releaseClaim(claimed.operationId);
        continue;
      }

      const result = await this.reconcileOne(dispatcher, buildRequest, claimed, token);
      await this.deps.store.releaseClaim(claimed.operationId);
      if (result.ok) processed++;
    }

    return success({ processed });
  }

  private async reconcileOne(
    dispatcher: IAsyncProviderDispatcher,
    buildRequest: (op: ProviderOperationRecord) => ProviderExecutionRequest,
    op: ProviderOperationRecord,
    token: CancellationToken
  ): Promise<Result<void>> {
    let record = op;

    if (record.state === "pending" || record.state === "submitted") {
      if (!record.providerJobId) {
        return failure(new ValidationError("missing providerJobId"));
      }
      const request = buildRequest(record);
      const poll = await dispatcher.pollAsync(request, record.providerJobId, token);
      record = {
        ...record,
        pollCount: record.pollCount + 1,
        lastPolledAt: this.nowIso(),
        updatedAt: this.nowIso(),
      };

      if (!poll.ok) {
        record = transitionOperation(record, record.state, this.nowIso(), {
          nextPollAt: new Date(
            this.clockMs() + (this.deps.defaultPollBackoffMs ?? 1000)
          ).toISOString(),
        });
        await this.deps.store.update(record);
        return poll;
      }

      const pollResult = poll.value;
      if (pollResult.status === "pending") {
        const backoff = pollResult.nextPollAfterMs ?? this.deps.defaultPollBackoffMs ?? 1000;
        record = transitionOperation(record, "pending", this.nowIso(), {
          nextPollAt: new Date(this.clockMs() + backoff).toISOString(),
        });
        await this.deps.store.update(record);
        return success(undefined);
      }

      if (pollResult.status === "failed" || pollResult.status === "cancelled") {
        record = transitionOperation(record, pollResult.status === "cancelled" ? "cancelled" : "failed", this.nowIso(), {
          errorCode: pollResult.errorCode,
          errorMessage: pollResult.errorMessage,
          terminalAt: this.nowIso(),
        });
        await this.deps.store.update(record);
        return success(undefined);
      }

      record = transitionOperation(record, "completed", this.nowIso(), {
        outputs: sanitizeOutputsForPersistence(pollResult.outputs),
        usage: pollResult.usage,
        safeMetadata: pollResult.safeMetadata,
        nextPollAt: this.nowIso(),
      });
      await this.deps.store.update(record);
    }

    if (record.state === "completed" || record.state === "result_ingesting") {
      if (record.state === "completed") {
        record = transitionOperation(record, "result_ingesting", this.nowIso());
        await this.deps.store.update(record);
      }

      const ingestResult = await this.ingestOutputs(record);
      if (!ingestResult.ok) {
        record = transitionOperation(record, "completed", this.nowIso(), {
          errorCode: "result_ingestion_failed",
          errorMessage: ingestResult.error.message,
          nextPollAt: new Date(this.clockMs() + 2000).toISOString(),
        });
        await this.deps.store.update(record);
        return ingestResult;
      }

      const artifactIds = ingestResult.value;
      record = transitionOperation(record, "artifact_created", this.nowIso(), {
        artifactIds,
        terminalAt: this.nowIso(),
      });
      await this.deps.store.update(record);

      if (this.deps.usageStore && record.usage && !record.safeMetadata?.usageRecorded) {
        const tokens = Number(record.usage.totalTokens ?? record.usage.computeUnits ?? 0);
        if (tokens > 0) {
          await this.deps.usageStore.addTokens(record.organizationId, tokens);
        }
        record = {
          ...record,
          safeMetadata: { ...record.safeMetadata, usageRecorded: true },
        };
        await this.deps.store.update(record);
      }

      return success(undefined);
    }

    return success(undefined);
  }

  private async ingestOutputs(
    record: ProviderOperationRecord
  ): Promise<Result<string[]>> {
    const outputs = record.outputs ?? [];
    const artifactIds: string[] = [];

    for (const output of outputs) {
      const alreadyFinalized = await this.deps.artifacts.isFinalizedDurable(
        record.operationId,
        output.index,
        record.executionId
      );
      if (alreadyFinalized) {
        artifactIds.push(
          this.deps.artifacts.buildArtifactId(record.operationId, output.index)
        );
        continue;
      }

      const artifactId = this.deps.artifacts.buildArtifactId(record.operationId, output.index);
      const ingested = await this.deps.ingestion.ingest({
        organizationId: record.organizationId,
        executionId: record.executionId,
        artifactId,
        outputIndex: output.index,
        temporaryUrl: output.temporaryUrl,
        base64: output.base64,
        existingStorageRef: output.storageRef,
        mimeType: output.mimeType,
      });

      if (!ingested.ok) return ingested;

      await this.deps.artifacts.finalize({
        operationId: record.operationId,
        executionId: record.executionId,
        organizationId: record.organizationId,
        outputIndex: output.index,
        blob: ingested.value,
        providerId: record.providerId,
        modelId: record.modelId,
        capabilityId: record.capabilityId,
      });

      artifactIds.push(artifactId);
    }

    return success(artifactIds);
  }
}
