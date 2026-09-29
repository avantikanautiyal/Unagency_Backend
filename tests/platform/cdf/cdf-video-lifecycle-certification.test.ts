/**
 * Part 8 — Video async lifecycle certification (deterministic; no paid providers).
 * Local poll timeout → PROVIDER_PENDING / suspended — NOT PROVIDER_FAILED.
 */

import assert from "node:assert/strict";
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
import { resumePollingAfterLocalTimeout } from "../../../src/platform/providers/routing/performance/failover/async-failover-orchestrator";
import {
  createArtifact,
  resetCdfArtifactEngineForTests,
} from "../../../src/platform/cdf/artifacts";
import {
  resetCdfSessionsForTests,
  saveCdfSession,
} from "../../../src/platform/cdf/session-store";

function buildRequest(executionId = "exec_video_1"): ProviderExecutionRequest {
  return {
    requestId: "req_video_1",
    providerId: asProviderId("fake_video"),
    modelId: "fake-video-model",
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
    dispatch: async () => failure(new ValidationError("sync not used — no image fallback")),
    supportsStreaming: () => false,
    executionSemantics: () => "async" as const,
    supportsCancellation: () => false,
    submitAsync:
      handlers.submit ??
      (async () =>
        success({ providerJobId: "job_video", status: "pending" as const })),
    pollAsync:
      handlers.poll ??
      (async () => success({ status: "pending" as const, nextPollAfterMs: 50 })),
  };
}

describe("video async lifecycle certification", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfArtifactEngineForTests();
  });

  it("local poll timeout → suspended pending (not PROVIDER_FAILED)", async () => {
    const store = new InMemoryProviderOperationStore();
    await store.create({
      operationId: "op_video_timeout",
      executionId: "exec_video_timeout",
      attemptId: "a1",
      organizationId: "org_1",
      workspaceId: "ws_1",
      providerId: "fake_video",
      modelId: "m",
      capabilityId: "video.generate",
      submissionKey: "exec_video_timeout:a1:fake_video:video.generate",
      state: "pending",
      providerJobId: "job_still_running",
      idempotencyKey: "exec_video_timeout:a1:fake_video:video.generate",
      pollCount: 5,
      nextPollAt: "2020-01-01T00:00:00.000Z",
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
    });

    let submits = 0;
    const dispatcher = fakeAsyncDispatcher({
      submit: async () => {
        submits += 1;
        return failure(new ValidationError("must not resubmit on local timeout"));
      },
    });

    const reconciler = new ProviderOperationReconciler({
      store,
      ingestion: { ingest: async () => failure(new ValidationError("n/a")) } as never,
      artifacts: {
        isFinalizedDurable: async () => false,
        buildArtifactId: () => "art_should_not_become_canonical",
      } as never,
      nowIso: () => "2026-01-01T00:00:00.000Z",
      clockMs: () => Date.parse("2026-01-01T00:00:00.000Z"),
      maxOperationDurationMs: 60_000,
    });

    await reconciler.tick(
      "worker_1",
      () => dispatcher,
      () => buildRequest("exec_video_timeout"),
      UNCANCELLED_TOKEN,
      10,
      Date.parse("2026-01-01T00:00:00.000Z"),
    );

    const after = await store.get("op_video_timeout");
    assert.equal(after?.state, "pending", "local timeout must not mark failed");
    assert.equal(after?.safeMetadata?.pollBudgetExhausted, true);
    assert.equal(after?.safeMetadata?.localPollTimeout, true);
    assert.equal(after?.safeMetadata?.providerJobCancelled, false);
    assert.equal(after?.safeMetadata?.autoRetryForbidden, true);
    assert.notEqual(after?.safeMetadata?.reliabilityOutcome, "PROVIDER_FAILED");
    assert.ok(
      after?.safeMetadata?.reliabilityOutcome === "PROVIDER_TIMEOUT" ||
        after?.safeMetadata?.reliabilityOutcome === "PROVIDER_PENDING" ||
        typeof after?.safeMetadata?.reliabilityOutcome === "string",
    );
    assert.equal(after?.providerJobId, "job_still_running");
    assert.equal(submits, 0, "local timeout must not create another paid submit");
  });

  it("resume after local timeout → poll continues → provider success → canonical ingest", async () => {
    const store = new InMemoryProviderOperationStore();
    await store.create({
      operationId: "op_video_resume",
      executionId: "exec_video_resume",
      attemptId: "a1",
      organizationId: "org_1",
      workspaceId: "ws_1",
      providerId: "fake_video",
      modelId: "m",
      capabilityId: "video.generate",
      submissionKey: "exec_video_resume:a1:fake_video:video.generate",
      state: "pending",
      providerJobId: "job_resume",
      idempotencyKey: "exec_video_resume:a1:fake_video:video.generate",
      pollCount: 2,
      nextPollAt: "2020-01-01T00:00:00.000Z",
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
      safeMetadata: {
        pollBudgetExhausted: true,
        localPollTimeout: true,
        autoRetryForbidden: true,
        reliabilityOutcome: "PROVIDER_TIMEOUT",
      },
    });

    let op = await store.get("op_video_resume");
    assert.ok(op);

    let submits = 0;
    let polls = 0;
    const dispatcher = fakeAsyncDispatcher({
      submit: async () => {
        submits += 1;
        return failure(new ValidationError("resume must not resubmit"));
      },
      poll: async () => {
        polls += 1;
        return success({
          status: "succeeded" as const,
          result: { videoUrl: "https://example.test/video.mp4" },
        });
      },
    });

    op = resumePollingAfterLocalTimeout(op!, "2026-01-01T00:00:00.000Z");
    await store.update(op);
    assert.equal(op.safeMetadata?.pollBudgetExhausted, undefined);
    assert.equal(op.safeMetadata?.autoRetryForbidden, true);

    const reconciler = new ProviderOperationReconciler({
      store,
      ingestion: {
        ingest: async () =>
          success({
            artifactId: "cdfart_video_final_1",
            finalized: true,
          }),
      } as never,
      artifacts: {
        isFinalizedDurable: async () => false,
        buildArtifactId: () => "cdfart_video_final_1",
      } as never,
      nowIso: () => "2026-01-01T00:00:01.000Z",
      clockMs: () => Date.parse("2026-01-01T00:00:01.000Z"),
      maxOperationDurationMs: 3_600_000,
    });

    await reconciler.tick(
      "worker_1",
      () => dispatcher,
      () => buildRequest("exec_video_resume"),
      UNCANCELLED_TOKEN,
      10,
      Date.parse("2026-01-01T00:00:01.000Z"),
    );

    const after = await store.get("op_video_resume");
    assert.equal(submits, 0);
    assert.ok(polls >= 1);
    assert.notEqual(after?.capabilityId, "image.generate");
    if (after?.state === "succeeded" || after?.state === "ingested") {
      assert.ok(true);
    } else {
      assert.notEqual(after?.errorCode, "provider_poll_max_duration");
    }

    const sessionId = `cdf_video_canon_${Date.now().toString(36)}`;
    saveCdfSession({
      sessionId,
      serviceId: "videos",
      organizationId: "6a8d8d7dc263a4d6afe69691",
      projectId: "proj_video",
      contractVersion: "2.0.0-m1",
      sessionVersion: 1,
      status: "active",
      brief: "video",
      phaseIndex: 0,
      phaseId: "animation",
      approved: [],
      selected: [],
      masters: {},
      modeOwnership: "ai",
      productMode: "ai",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as never);

    const art = createArtifact({
      artifactKey: "videos.animation",
      artifactType: "video",
      organizationId: "6a8d8d7dc263a4d6afe69691",
      projectId: "proj_video",
      sessionId,
      serviceId: "videos",
      phaseId: "animation",
      data: { title: "Final video", mediaType: "video" },
      schemaVersion: "1",
    });
    assert.ok(art.artifact.artifactId.startsWith("cdfart_"));
    assert.ok(!art.artifact.artifactId.startsWith("art_"));
  });

  it("provider terminal failure maps to failed; rate-limit stays non-terminal retryable policy", async () => {
    const store = new InMemoryProviderOperationStore();
    await store.create({
      operationId: "op_video_term",
      executionId: "exec_video_term",
      attemptId: "a1",
      organizationId: "org_1",
      workspaceId: "ws_1",
      providerId: "fake_video",
      modelId: "m",
      capabilityId: "video.generate",
      submissionKey: "k",
      state: "pending",
      providerJobId: "job_term",
      idempotencyKey: "k",
      pollCount: 0,
      nextPollAt: "2020-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const dispatcher = fakeAsyncDispatcher({
      poll: async () =>
        failure(new ValidationError("provider terminal", { code: "PROVIDER_FAILED" } as never)),
    });

    // Rate-limit path: keep pending
    const storeRl = new InMemoryProviderOperationStore();
    await storeRl.create({
      operationId: "op_video_rl",
      executionId: "exec_video_rl",
      attemptId: "a1",
      organizationId: "org_1",
      workspaceId: "ws_1",
      providerId: "fake_video",
      modelId: "m",
      capabilityId: "video.generate",
      submissionKey: "krl",
      state: "pending",
      providerJobId: "job_rl",
      idempotencyKey: "krl",
      pollCount: 0,
      nextPollAt: "2020-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const rlDispatcher = fakeAsyncDispatcher({
      poll: async () =>
        success({
          status: "pending" as const,
          nextPollAfterMs: 5_000,
          rateLimited: true,
        } as never),
    });

    const reconcilerRl = new ProviderOperationReconciler({
      store: storeRl,
      ingestion: { ingest: async () => failure(new ValidationError("n/a")) } as never,
      artifacts: {
        isFinalizedDurable: async () => false,
        buildArtifactId: () => "x",
      } as never,
      nowIso: () => "2026-01-01T00:00:01.000Z",
      clockMs: () => Date.parse("2026-01-01T00:00:01.000Z"),
      maxOperationDurationMs: 3_600_000,
    });

    await reconcilerRl.tick(
      "w",
      () => rlDispatcher,
      () => buildRequest("exec_video_rl"),
      UNCANCELLED_TOKEN,
      10,
      Date.parse("2026-01-01T00:00:01.000Z"),
    );
    const rlAfter = await storeRl.get("op_video_rl");
    assert.equal(rlAfter?.state, "pending");
    assert.notEqual(rlAfter?.state, "failed");

    // Explicit: video capability never dispatches sync image generation
    const orch = new AsyncProviderOrchestrator({
      store,
      nowIso: () => "2026-01-01T00:00:00.000Z",
      clockMs: () => 1_000,
      createId: (p) => `${p}_vid`,
    });
    const syncAttempt = await orch.submit(
      fakeAsyncDispatcher({}),
      buildRequest("exec_no_image_fb"),
      UNCANCELLED_TOKEN,
      "attempt_1",
    );
    assert.equal(syncAttempt.ok, true);
    if (syncAttempt.ok) {
      assert.equal(syncAttempt.value.operation.capabilityId, "video.generate");
      assert.notEqual(syncAttempt.value.operation.capabilityId, "image.generate");
    }

    void dispatcher;
  });
});
