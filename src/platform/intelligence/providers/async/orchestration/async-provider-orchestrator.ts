/**
 * Async provider submission orchestrator — idempotent durable submit intent.
 */

import { failure, success, type Result } from "../../../shared/result";
import { ValidationError } from "../../../shared/errors";
import type { CancellationToken } from "../../runtime/contracts/cancellation";
import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import {
  isAsyncProviderDispatcher,
  type IAsyncProviderDispatcher,
} from "../interfaces/async-provider-dispatcher";
import type { IProviderOperationStore } from "../interfaces/provider-operation-store";
import {
  buildSubmissionKey,
  transitionOperation,
} from "../interfaces/provider-operation-store";
import type { ProviderOperationRecord } from "../contracts/provider-operation";
import { canTransitionProviderOperation } from "../contracts/provider-operation-state";
import type { BlobAccessService } from "../../../../media/blob/blob-access-service";
import { extractInputAssets } from "../../common/input-asset-validator";
import { sanitizeOutputsForPersistence } from "../persistence/sanitize-operation-record";

export interface AsyncSubmitOutcome {
  readonly kind: "accepted_async";
  readonly operation: ProviderOperationRecord;
}

export interface AsyncProviderOrchestratorOptions {
  readonly store: IProviderOperationStore;
  readonly blobAccess?: BlobAccessService;
  readonly maxOperationDurationMs?: number;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export class AsyncProviderOrchestrator {
  private readonly nowIso: () => string;
  private readonly clockMs: () => number;
  private readonly createId: (prefix: string) => string;

  constructor(private readonly deps: AsyncProviderOrchestratorOptions) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.clockMs = deps.clockMs ?? (() => Date.now());
    let seq = 0;
    this.createId = deps.createId ?? ((p) => `${p}_${++seq}_${this.clockMs()}`);
  }

  async submit(
    dispatcher: IAsyncProviderDispatcher,
    request: ProviderExecutionRequest,
    token: CancellationToken,
    attemptId: string
  ): Promise<Result<AsyncSubmitOutcome>> {
    if (!isAsyncProviderDispatcher(dispatcher)) {
      return failure(new ValidationError("Provider dispatcher is not async-capable"));
    }

    const assetCheck = await this.validateInputAssets(request);
    if (!assetCheck.ok) return assetCheck;

    const submissionKey = buildSubmissionKey({
      executionId: String(request.context.executionId),
      attemptId,
      providerId: String(request.providerId),
      capabilityId: String(request.capabilityId),
    });

    const idempotencyKey = submissionKey;
    const existing = await this.deps.store.getBySubmissionKey(submissionKey);
    if (existing?.providerJobId && existing.state !== "submitting") {
      return success({ kind: "accepted_async", operation: existing });
    }

    const now = this.nowIso();
    let record: ProviderOperationRecord =
      existing ??
      ({
        operationId: this.createId("prov_op"),
        executionId: String(request.context.executionId),
        attemptId,
        organizationId: String(request.context.organizationId),
        workspaceId: String(request.context.workspaceId),
        providerId: String(request.providerId),
        modelId: request.modelId ?? "",
        capabilityId: String(request.capabilityId),
        submissionKey,
        state: "submitting",
        idempotencyKey,
        pollCount: 0,
        createdAt: now,
        updatedAt: now,
      } satisfies ProviderOperationRecord);

    if (!existing) {
      await this.deps.store.create(record);
    } else if (existing.state !== "submitting") {
      return success({ kind: "accepted_async", operation: existing });
    }

    const submitResult = await dispatcher.submitAsync(request, token, idempotencyKey);
    if (!submitResult.ok) {
      if (canTransitionProviderOperation(record.state, "failed")) {
        record = transitionOperation(record, "failed", this.nowIso(), {
          errorMessage: submitResult.error.message,
          terminalAt: this.nowIso(),
        });
        await this.deps.store.update(record);
      }
      return submitResult;
    }

    const submitted = submitResult.value;
    const payloadMeta =
      request.payload && typeof request.payload === "object"
        ? (request.payload as Record<string, unknown>)
        : {};
    const failoverChain = payloadMeta.failoverChain;
    const routingDecisionId = payloadMeta.routingDecisionId;
    record = transitionOperation(record, "submitted", this.nowIso(), {
      providerJobId: submitted.providerJobId,
      submittedAt: now,
      safeMetadata: {
        ...(submitted.safeMetadata ?? {}),
        ...(Array.isArray(failoverChain) ? { failoverChain } : {}),
        ...(typeof routingDecisionId === "string" ? { routingDecisionId } : {}),
      },
    });
    await this.deps.store.update(record);

    if (submitted.status === "completed") {
      record = transitionOperation(record, "completed", this.nowIso(), {
        outputs: sanitizeOutputsForPersistence(submitted.outputs),
        usage: submitted.usage,
        nextPollAt: this.nowIso(),
      });
    } else {
      record = transitionOperation(record, "pending", this.nowIso(), {
        nextPollAt: new Date(this.clockMs() + 100).toISOString(),
      });
    }

    await this.deps.store.update(record);
    return success({ kind: "accepted_async", operation: record });
  }

  private async validateInputAssets(
    request: ProviderExecutionRequest
  ): Promise<Result<void>> {
    if (!this.deps.blobAccess) return success(undefined);
    const assets = extractInputAssets(request.payload);
    for (const asset of assets) {
      if (!asset.storageRef) continue;
      const resolved = this.deps.blobAccess.resolveForTenantAsync
        ? await this.deps.blobAccess.resolveForTenantAsync(
            asset.storageRef,
            String(request.context.organizationId)
          )
        : this.deps.blobAccess.resolveForTenant(
            asset.storageRef,
            String(request.context.organizationId)
          );
      if (!resolved.ok) return resolved;
    }
    return success(undefined);
  }
}
