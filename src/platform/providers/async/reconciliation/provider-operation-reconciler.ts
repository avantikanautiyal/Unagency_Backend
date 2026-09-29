/**
 * Durable provider operation reconciliation worker.
 */

import { failure, success, type Result } from "../../../core/result";
import { ValidationError } from "../../../core/errors";
import type { CancellationToken } from "../../runtime/contracts/cancellation";
import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import type { IAsyncProviderDispatcher } from "../interfaces/async-provider-dispatcher";
import type { IProviderOperationStore } from "../interfaces/provider-operation-store";
import { transitionOperation } from "../interfaces/provider-operation-store";
import type { ProviderOperationRecord } from "../contracts/provider-operation";
import { isTerminalProviderOperationState } from "../contracts/provider-operation-state";
import type { MediaIngestionService } from "../../../media/ingestion/media-ingestion-service";
import type { MediaArtifactService } from "../../../media/artifacts/media-artifact-service";
import type { ITenantUsageStore } from "../../../infrastructure/durability/interfaces/execution-store-ports";
import type { IBlobStorage } from "../../../persistence/interfaces/persistence";
import type { IBlobMetadataRepository } from "../../../media/blob/blob-metadata-repository";
import type { BlobAccessService } from "../../../media/blob/blob-access-service";
import { sanitizeOutputsForPersistence } from "../persistence/sanitize-operation-record";
import { getUsageAccountingService } from "../../../accounting/usage/usage-accounting-service";
import type { ProviderId } from "../../../core/identifiers";
import { logOsExecutionEvent } from "../../../os/observability/execution-log";
import { reliabilityOutcomeFromAsyncErrorCode } from "../../../execution-reliability/execution-outcome";
import { resumePollingAfterLocalTimeout } from "../../routing/performance/failover/async-failover-orchestrator";
import { maybeComposeVideoAfterIngest } from "../../video/common/video-target-compose";
import { isVideoGenerationCapability } from "../../common/resolve-execution-modality";

/** Max automatic poll-budget extensions for a still-open provider job. */
const MAX_POLL_BUDGET_EXTENSIONS = 3;

export interface ProviderOperationReconcilerOptions {
  readonly store: IProviderOperationStore;
  readonly ingestion: MediaIngestionService;
  readonly artifacts: MediaArtifactService;
  readonly usageStore?: ITenantUsageStore;
  readonly blobStorage?: IBlobStorage;
  readonly blobMetadata?: IBlobMetadataRepository;
  readonly blobAccess?: BlobAccessService;
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
    // asOfMs may be skewed forward to force nextPollAt due-ness (tests).
    // Poll-budget age MUST use real wall clock or video jobs false-timeout.
    const pollAsOfMs = asOfMs ?? this.clockMs();
    const ageNowMs = this.clockMs();
    await this.deps.store.reclaimExpiredLeases(this.nowIso(), pollAsOfMs);

    const due = await this.deps.store.listDueForPoll(pollAsOfMs, limit);
    let processed = 0;

    for (const dueOp of due) {
      let op = dueOp;
      if (isTerminalProviderOperationState(op.state)) continue;
      // Provider already returned outputs — never apply poll-budget parking;
      // result_ingesting must proceed to artifact_created.
      const pastProviderTerminal =
        op.state === "completed" || op.state === "result_ingesting";
      // Suspended after local poll-budget exhaustion — wait for resume /
      // extension (below) or explicit resumePollingAfterLocalTimeout.
      if (!pastProviderTerminal && op.safeMetadata?.pollBudgetExhausted === true) {
        const extensionsRaw = op.safeMetadata?.pollBudgetExtensionCount;
        const extensions =
          typeof extensionsRaw === "number" && Number.isFinite(extensionsRaw)
            ? Math.max(0, Math.trunc(extensionsRaw))
            : 0;
        if (op.providerJobId && extensions < MAX_POLL_BUDGET_EXTENSIONS) {
          const resumed = resumePollingAfterLocalTimeout(op, this.nowIso());
          op = {
            ...resumed,
            safeMetadata: {
              ...(resumed.safeMetadata ?? {}),
              pollBudgetExtensionCount: extensions + 1,
            },
          };
          await this.deps.store.update(op);
          logOsExecutionEvent("execution.async.pending", {
            requestId: op.operationId,
            executionId: op.executionId,
            organizationId: op.organizationId,
            providerId: op.providerId,
            modelId: op.modelId,
            capabilityId: op.capabilityId,
            status: "EXECUTION_PENDING",
            retryCount: extensions + 1,
          });
        } else {
          continue;
        }
      }

      const maxDur = this.deps.maxOperationDurationMs ?? 7_200_000;
      const ageBaseRaw = op.safeMetadata?.pollBudgetAnchorAt;
      const ageBaseMs =
        typeof ageBaseRaw === "string" && Number.isFinite(Date.parse(ageBaseRaw))
          ? Date.parse(ageBaseRaw)
          : Date.parse(op.createdAt);
      const ageMs = ageNowMs - ageBaseMs;
      if (!pastProviderTerminal && Number.isFinite(ageMs) && ageMs > maxDur) {
        const extensionsRaw = op.safeMetadata?.pollBudgetExtensionCount;
        const extensions =
          typeof extensionsRaw === "number" && Number.isFinite(extensionsRaw)
            ? Math.max(0, Math.trunc(extensionsRaw))
            : 0;
        // Prefer extending the local poll window for in-flight vendor jobs
        // (common for video) over parking nextPollAt a year out.
        if (op.providerJobId && extensions < MAX_POLL_BUDGET_EXTENSIONS) {
          const resumed = resumePollingAfterLocalTimeout(op, this.nowIso());
          op = {
            ...resumed,
            safeMetadata: {
              ...(resumed.safeMetadata ?? {}),
              pollBudgetExtensionCount: extensions + 1,
            },
          };
          await this.deps.store.update(op);
          logOsExecutionEvent("execution.async.pending", {
            requestId: op.operationId,
            executionId: op.executionId,
            organizationId: op.organizationId,
            providerId: op.providerId,
            modelId: op.modelId,
            capabilityId: op.capabilityId,
            status: "EXECUTION_PENDING",
            retryCount: extensions + 1,
          });
          // Continue into claim/poll with the refreshed budget.
        } else {
          // Local/application poll budget exhausted ≠ provider terminal failure.
          // Keep the operation non-terminal so restart can resume polling the
          // durable providerJobId. Never auto-cancel the provider job and never
          // auto-retry submission (may duplicate billing).
          const errorCode = op.providerJobId
            ? "provider_poll_max_duration"
            : "provider_job_timeout";
          logOsExecutionEvent("execution.async.timeout", {
            requestId: op.operationId,
            executionId: op.executionId,
            organizationId: op.organizationId,
            providerId: op.providerId,
            modelId: op.modelId,
            capabilityId: op.capabilityId,
            errorCode,
            status: reliabilityOutcomeFromAsyncErrorCode(errorCode) ?? "PROVIDER_TIMEOUT",
          });
          // Suspend further polling without marking failed. Resume clears
          // pollBudgetExhausted / sets nextPollAt.
          const farFutureIso = new Date(ageNowMs + 365 * 24 * 60 * 60 * 1000).toISOString();
          await this.deps.store.update({
            ...op,
            updatedAt: this.nowIso(),
            nextPollAt: farFutureIso,
            safeMetadata: {
              ...(op.safeMetadata ?? {}),
              pollBudgetExhausted: true,
              providerJobCancelled: false,
              autoRetryForbidden: true,
              localPollTimeout: true,
              reliabilityOutcome:
                reliabilityOutcomeFromAsyncErrorCode(errorCode) ?? "PROVIDER_TIMEOUT",
              pollBudgetErrorCode: errorCode,
              pollBudgetMessage: op.providerJobId
                ? "async polling exhausted max duration — provider job was not cancelled; outcome may still exist at provider"
                : "async provider operation exceeded max duration before providerJobId was recorded",
            },
          });
          processed++;
          continue;
        }
      }

      // Stale submitting without a provider job id cannot be polled —
      // PROVIDER_OUTCOME_UNKNOWN (do not auto-resubmit; job may already exist).
      const submittingStaleMs = Math.min(
        this.deps.leaseTtlMs ?? 30_000,
        60_000,
      );
      if (
        op.state === "submitting" &&
        !op.providerJobId &&
        Number.isFinite(ageMs) &&
        ageMs > submittingStaleMs
      ) {
        logOsExecutionEvent("execution.async.unknown", {
          requestId: op.operationId,
          executionId: op.executionId,
          organizationId: op.organizationId,
          providerId: op.providerId,
          modelId: op.modelId,
          capabilityId: op.capabilityId,
          errorCode: "provider_submit_stale",
          status: "PROVIDER_OUTCOME_UNKNOWN",
        });
        await this.deps.store.update(
          transitionOperation(op, "failed", this.nowIso(), {
            errorCode: "provider_submit_stale",
            errorMessage:
              "async provider submit left in submitting without providerJobId after restart/timeout — outcome unknown; do not auto-retry",
            terminalAt: this.nowIso(),
            safeMetadata: {
              ...(op.safeMetadata ?? {}),
              autoRetryForbidden: true,
              reliabilityOutcome: "PROVIDER_OUTCOME_UNKNOWN",
            },
          }),
        );
        processed++;
        continue;
      }
      if (op.state === "submitting") {
        // Not yet stale — skip until age threshold or a submit retry path claims it.
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
        // Transient poll failure — keep pending; never create a duplicate job.
        logOsExecutionEvent("execution.async.poll", {
          requestId: record.operationId,
          executionId: record.executionId,
          organizationId: record.organizationId,
          providerId: record.providerId,
          modelId: record.modelId,
          capabilityId: record.capabilityId,
          errorCode: poll.error.code,
          status: "PROVIDER_OUTCOME_UNKNOWN",
          retryCount: record.pollCount,
        });
        record = transitionOperation(record, record.state, this.nowIso(), {
          nextPollAt: new Date(
            this.clockMs() + (this.deps.defaultPollBackoffMs ?? 1000)
          ).toISOString(),
          safeMetadata: {
            ...(record.safeMetadata ?? {}),
            lastPollTransientFailure: true,
            autoRetryForbidden: true,
          },
        });
        await this.deps.store.update(record);
        return poll;
      }

      const pollResult = poll.value;
      if (pollResult.status === "pending") {
        const backoff = pollResult.nextPollAfterMs ?? this.deps.defaultPollBackoffMs ?? 1000;
        logOsExecutionEvent("execution.async.pending", {
          requestId: record.operationId,
          executionId: record.executionId,
          organizationId: record.organizationId,
          providerId: record.providerId,
          modelId: record.modelId,
          capabilityId: record.capabilityId,
          status: "EXECUTION_PENDING",
          retryCount: record.pollCount,
        });
        record = transitionOperation(record, "pending", this.nowIso(), {
          nextPollAt: new Date(this.clockMs() + backoff).toISOString(),
        });
        await this.deps.store.update(record);
        return success(undefined);
      }

      if (pollResult.status === "failed" || pollResult.status === "cancelled") {
        logOsExecutionEvent(
          pollResult.status === "cancelled"
            ? "execution.async.failed"
            : "execution.async.failed",
          {
            requestId: record.operationId,
            executionId: record.executionId,
            organizationId: record.organizationId,
            providerId: record.providerId,
            modelId: record.modelId,
            capabilityId: record.capabilityId,
            errorCode: pollResult.errorCode,
            status:
              pollResult.status === "cancelled" ? "USER_CANCELLED" : "PROVIDER_FAILED",
          }
        );
        record = transitionOperation(record, pollResult.status === "cancelled" ? "cancelled" : "failed", this.nowIso(), {
          errorCode: pollResult.errorCode,
          errorMessage: pollResult.errorMessage,
          terminalAt: this.nowIso(),
        });
        await this.deps.store.update(record);
        return success(undefined);
      }

      logOsExecutionEvent("execution.async.completed", {
        requestId: record.operationId,
        executionId: record.executionId,
        organizationId: record.organizationId,
        providerId: record.providerId,
        modelId: record.modelId,
        capabilityId: record.capabilityId,
        status: "SUCCEEDED",
        retryCount: record.pollCount,
      });
      record = transitionOperation(record, "completed", this.nowIso(), {
        outputs: sanitizeOutputsForPersistence(pollResult.outputs),
        usage: pollResult.usage,
        safeMetadata: {
          ...(record.safeMetadata ?? {}),
          ...(pollResult.safeMetadata ?? {}),
        },
        nextPollAt: this.nowIso(),
      });
      await this.deps.store.update(record);
    }

    if (record.state === "completed" || record.state === "result_ingesting") {
      if (record.state === "completed") {
        record = transitionOperation(record, "result_ingesting", this.nowIso());
        await this.deps.store.update(record);
      }

      const ingestResult = await this.ingestOutputs(
        record,
        dispatcher,
        buildRequest,
      );
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
        const request = buildRequest(record);
        const accounting = getUsageAccountingService();
        void accounting
          .reconcileLateCompletion({
            request,
            response: {
              requestId: request.requestId,
              providerId: request.providerId as ProviderId,
              output: {},
              usage: record.usage as Readonly<Record<string, unknown>>,
              providerRequestId: record.providerJobId ?? undefined,
              streamed: false,
              finishedAt: this.nowIso(),
            },
            success: true,
            completedAt: this.nowIso(),
            operationId: record.operationId,
            attemptId: record.attemptId,
            providerJobId: record.providerJobId ?? null,
            retryCount: record.pollCount,
          })
          .catch(() => {
            /* accounting must not affect reconciliation */
          });
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
    record: ProviderOperationRecord,
    dispatcher: IAsyncProviderDispatcher,
    buildRequest: (op: ProviderOperationRecord) => ProviderExecutionRequest,
  ): Promise<Result<string[]>> {
    const outputs = record.outputs ?? [];
    const artifactIds: string[] = [];

    for (const output of outputs) {
      const alreadyFinalized = await this.deps.artifacts.isFinalizedDurable(
        record.operationId,
        output.index,
        record.executionId
      );
      const artifactId = this.deps.artifacts.buildArtifactId(
        record.operationId,
        output.index,
      );
      if (alreadyFinalized) {
        artifactIds.push(artifactId);
        await this.maybeComposeFinalizedVideo({
          record,
          artifactId,
          output,
          dispatcher,
          buildRequest,
        });
        continue;
      }

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

      await this.runVideoTargetCompose({
        record,
        artifactId,
        storageKey: ingested.value.storageKey,
        outputMimeType: output.mimeType ?? ingested.value.mimeType,
        outputType: output.type,
        dispatcher,
        buildRequest,
      });

      artifactIds.push(artifactId);
    }

    return success(artifactIds);
  }

  private async maybeComposeFinalizedVideo(input: {
    readonly record: ProviderOperationRecord;
    readonly artifactId: string;
    readonly output: {
      readonly type: string;
      readonly mimeType?: string;
    };
    readonly dispatcher: IAsyncProviderDispatcher;
    readonly buildRequest: (op: ProviderOperationRecord) => ProviderExecutionRequest;
  }): Promise<void> {
    if (!this.deps.blobStorage || !this.deps.blobMetadata) return;
    if (!isVideoGenerationCapability(input.record.capabilityId)) return;
    const storageKey = await this.deps.artifacts.resolveBlobStorageKey(
      input.artifactId,
      input.record.executionId,
    );
    if (!storageKey) return;
    await this.runVideoTargetCompose({
      record: input.record,
      artifactId: input.artifactId,
      storageKey,
      outputMimeType: input.output.mimeType,
      outputType: input.output.type,
      dispatcher: input.dispatcher,
      buildRequest: input.buildRequest,
    });
  }

  private async runVideoTargetCompose(input: {
    readonly record: ProviderOperationRecord;
    readonly artifactId: string;
    readonly storageKey: string;
    readonly outputMimeType?: string;
    readonly outputType?: string;
    readonly dispatcher: IAsyncProviderDispatcher;
    readonly buildRequest: (op: ProviderOperationRecord) => ProviderExecutionRequest;
  }): Promise<void> {
    if (!this.deps.blobStorage || !this.deps.blobMetadata) return;
    if (!isVideoGenerationCapability(input.record.capabilityId)) return;
    if (input.outputType && input.outputType !== "video") {
      if (!(input.outputMimeType ?? "").startsWith("video/")) return;
    }

    const latest =
      (await this.deps.store.get(input.record.operationId)) ?? input.record;
    const baseRequest = input.buildRequest(latest);
    const composeResult = await maybeComposeVideoAfterIngest({
      record: latest,
      artifactId: input.artifactId,
      storageKey: input.storageKey,
      outputMimeType: input.outputMimeType,
      outputType: input.outputType,
      dispatcher: input.dispatcher,
      buildRequest: (payload) => ({
        ...baseRequest,
        requestId: `${baseRequest.requestId}:vcompose:${Date.now()}`,
        payload,
      }),
      blobStorage: this.deps.blobStorage,
      blobMetadata: this.deps.blobMetadata,
      blobAccess: this.deps.blobAccess,
      nowIso: this.nowIso,
      patchSafeMetadata: async (patch) => {
        const current =
          (await this.deps.store.get(input.record.operationId)) ?? latest;
        await this.deps.store.update({
          ...current,
          updatedAt: this.nowIso(),
          safeMetadata: {
            ...(current.safeMetadata ?? {}),
            ...patch,
          },
        });
      },
    });
    if (composeResult.ok && composeResult.value.composed) {
      logOsExecutionEvent("execution.async.completed", {
        requestId: input.record.operationId,
        executionId: input.record.executionId,
        organizationId: input.record.organizationId,
        providerId: input.record.providerId,
        modelId: input.record.modelId,
        capabilityId: input.record.capabilityId,
        status: "SUCCEEDED",
        retryCount: composeResult.value.segmentCount ?? 0,
      });
    }
  }
}
