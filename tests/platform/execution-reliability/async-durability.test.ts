/**
 * Generic async durability / timeout semantics (no provider-specific branches).
 */

import { InMemoryProviderOperationStore } from "../../../src/platform/providers/async/store/in-memory-provider-operation-store";
import { ProviderOperationReconciler } from "../../../src/platform/providers/async/reconciliation/provider-operation-reconciler";
import { AsyncProviderOrchestrator } from "../../../src/platform/providers/async/orchestration/async-provider-orchestrator";
import type { IAsyncProviderDispatcher } from "../../../src/platform/providers/async/interfaces/async-provider-dispatcher";
import type { ProviderExecutionRequest } from "../../../src/platform/providers/runtime/contracts/provider-execution-request";
import { success, failure } from "../../../src/platform/core/result";
import { ValidationError } from "../../../src/platform/core/errors";
import { UNCANCELLED_TOKEN } from "../../../src/platform/providers/runtime/contracts/cancellation";
import {
  asCapabilityId,
  asExecutionId,
  asOrganizationId,
  asProviderId,
  asWorkspaceId,
} from "../../../src/platform/core/identifiers";

function buildRequest(executionId = "exec_1"): ProviderExecutionRequest {
  return {
    requestId: "req_1",
    providerId: asProviderId("fake_video"),
    modelId: "fake-model",
    capabilityId: asCapabilityId("video.generate"),
    context: {
      executionId: asExecutionId(executionId),
      organizationId: asOrganizationId("org_1"),
      workspaceId: asWorkspaceId("ws_1"),
    },
    payload: {},
  } as ProviderExecutionRequest;
}

function fakeAsyncDispatcher(handlers: {
  submit?: IAsyncProviderDispatcher["submitAsync"];
  poll?: IAsyncProviderDispatcher["pollAsync"];
}): IAsyncProviderDispatcher {
  return {
    dispatch: async () => failure(new ValidationError("sync not used")),
    supportsStreaming: () => false,
    executionSemantics: () => "async" as const,
    supportsCancellation: () => false,
    submitAsync:
      handlers.submit ??
      (async () =>
        success({ providerJobId: "job_default", status: "pending" as const })),
    pollAsync:
      handlers.poll ??
      (async () => success({ status: "pending" as const, nextPollAfterMs: 50 })),
  };
}

describe("execution reliability — async durability", () => {
  it("persists providerJobId and resumes idempotently without duplicate submit", async () => {
    let submitCount = 0;
    const dispatcher = fakeAsyncDispatcher({
      submit: async () => {
        submitCount += 1;
        return success({
          providerJobId: "job_abc",
          status: "pending" as const,
        });
      },
    });

    const store = new InMemoryProviderOperationStore();
    const orch = new AsyncProviderOrchestrator({
      store,
      nowIso: () => "2026-01-01T00:00:00.000Z",
      clockMs: () => 1_000,
      createId: (p) => `${p}_1`,
    });
    const first = await orch.submit(
      dispatcher,
      buildRequest(),
      UNCANCELLED_TOKEN,
      "attempt_1"
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.operation.providerJobId).toBe("job_abc");
    expect(submitCount).toBe(1);

    const second = await orch.submit(
      dispatcher,
      buildRequest(),
      UNCANCELLED_TOKEN,
      "attempt_1"
    );
    expect(second.ok).toBe(true);
    expect(submitCount).toBe(1);
  });

  it("transient poll failure keeps pending and does not create a new job", async () => {
    const store = new InMemoryProviderOperationStore();
    await store.create({
      operationId: "op_1",
      executionId: "exec_1",
      attemptId: "a1",
      organizationId: "org_1",
      workspaceId: "ws_1",
      providerId: "fake_video",
      modelId: "m",
      capabilityId: "video.generate",
      submissionKey: "exec_1:a1:fake_video:video.generate",
      state: "pending",
      providerJobId: "job_alive",
      idempotencyKey: "exec_1:a1:fake_video:video.generate",
      pollCount: 0,
      nextPollAt: "2020-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    let submits = 0;
    const dispatcher = fakeAsyncDispatcher({
      submit: async () => {
        submits += 1;
        return failure(new ValidationError("should not submit"));
      },
      poll: async () => failure(new ValidationError("network blip")),
    });

    const reconciler = new ProviderOperationReconciler({
      store,
      ingestion: { ingest: async () => failure(new ValidationError("n/a")) } as never,
      artifacts: {
        isFinalizedDurable: async () => false,
        buildArtifactId: () => "art_1",
      } as never,
      nowIso: () => "2026-01-01T00:01:00.000Z",
      clockMs: () => Date.parse("2026-01-01T00:01:00.000Z"),
      maxOperationDurationMs: 3_600_000,
    });

    await reconciler.tick(
      "worker_1",
      () => dispatcher,
      () => buildRequest(),
      UNCANCELLED_TOKEN,
      10,
      Date.parse("2026-01-01T00:01:00.000Z")
    );

    const after = await store.get("op_1");
    expect(after?.state).toBe("pending");
    expect(after?.providerJobId).toBe("job_alive");
    expect(after?.safeMetadata?.autoRetryForbidden).toBe(true);
    expect(submits).toBe(0);
  });

  it("max poll duration with durable job id suspends pending — not failed", async () => {
    const store = new InMemoryProviderOperationStore();
    await store.create({
      operationId: "op_old",
      executionId: "exec_old",
      attemptId: "a1",
      organizationId: "org_1",
      workspaceId: "ws_1",
      providerId: "fake_video",
      modelId: "m",
      capabilityId: "video.generate",
      submissionKey: "exec_old:a1:fake_video:video.generate",
      state: "pending",
      providerJobId: "job_still_running",
      idempotencyKey: "exec_old:a1:fake_video:video.generate",
      pollCount: 5,
      nextPollAt: "2020-01-01T00:00:00.000Z",
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
    });

    const reconciler = new ProviderOperationReconciler({
      store,
      ingestion: { ingest: async () => failure(new ValidationError("n/a")) } as never,
      artifacts: {
        isFinalizedDurable: async () => false,
        buildArtifactId: () => "art_1",
      } as never,
      nowIso: () => "2026-01-01T00:00:00.000Z",
      clockMs: () => Date.parse("2026-01-01T00:00:00.000Z"),
      maxOperationDurationMs: 60_000,
    });

    await reconciler.tick(
      "worker_1",
      () => undefined,
      () => buildRequest("exec_old"),
      UNCANCELLED_TOKEN,
      10,
      Date.parse("2026-01-01T00:00:00.000Z")
    );

    const after = await store.get("op_old");
    expect(after?.state).toBe("pending");
    expect(after?.safeMetadata?.pollBudgetExhausted).toBe(true);
    expect(after?.safeMetadata?.localPollTimeout).toBe(true);
    expect(after?.safeMetadata?.providerJobCancelled).toBe(false);
    expect(after?.safeMetadata?.autoRetryForbidden).toBe(true);
    expect(after?.safeMetadata?.pollBudgetErrorCode).toBe("provider_poll_max_duration");
    expect(after?.providerJobId).toBe("job_still_running");
  });

  it("stale submitting without job id is outcome-unknown and not auto-retried", async () => {
    const store = new InMemoryProviderOperationStore();
    const createdAt = new Date(Date.now() - 90_000).toISOString();
    await store.create({
      operationId: "op_stale",
      executionId: "exec_stale",
      attemptId: "a1",
      organizationId: "org_1",
      workspaceId: "ws_1",
      providerId: "fake_video",
      modelId: "m",
      capabilityId: "video.generate",
      submissionKey: "exec_stale:a1:fake_video:video.generate",
      state: "submitting",
      idempotencyKey: "exec_stale:a1:fake_video:video.generate",
      pollCount: 0,
      nextPollAt: "2020-01-01T00:00:00.000Z",
      createdAt,
      updatedAt: createdAt,
    });

    let submits = 0;
    const dispatcher = fakeAsyncDispatcher({
      submit: async () => {
        submits += 1;
        return success({ providerJobId: "should_not", status: "pending" as const });
      },
    });

    const reconciler = new ProviderOperationReconciler({
      store,
      ingestion: { ingest: async () => failure(new ValidationError("n/a")) } as never,
      artifacts: {
        isFinalizedDurable: async () => false,
        buildArtifactId: () => "art_1",
      } as never,
      nowIso: () => new Date().toISOString(),
      clockMs: () => Date.now(),
      leaseTtlMs: 30_000,
      maxOperationDurationMs: 3_600_000,
    });

    await reconciler.tick(
      "worker_1",
      () => dispatcher,
      () => buildRequest("exec_stale"),
      UNCANCELLED_TOKEN,
      10
    );

    const after = await store.get("op_stale");
    expect(after?.state).toBe("failed");
    expect(after?.errorCode).toBe("provider_submit_stale");
    expect(after?.safeMetadata?.reliabilityOutcome).toBe("PROVIDER_OUTCOME_UNKNOWN");
    expect(after?.safeMetadata?.autoRetryForbidden).toBe(true);
    expect(submits).toBe(0);
  });
});
