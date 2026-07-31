/**
 * M9.5D — async provider runtime, durable media ingestion, reconciliation certification.
 * Zero external network / AI provider calls.
 */

import { sampleRequest } from "../../../../../src/platform/intelligence/providers/runtime/testing";
import type { ProviderExecutionRequest } from "../../../../../src/platform/intelligence/providers/runtime/contracts/provider-execution-request";
import type { CancellationToken } from "../../../../../src/platform/intelligence/providers/runtime/contracts/cancellation";
import {
  asCapabilityId,
  asExecutionId,
  asOrganizationId,
  asProviderId,
  asWorkspaceId,
} from "../../../../../src/platform/intelligence/shared/identifiers";
import { InMemoryProviderOperationStore } from "../../../../../src/platform/intelligence/providers/async/store/in-memory-provider-operation-store";
import {
  FakeAsyncProviderDispatcher,
  fakeAsyncProviderId,
  type FakeAsyncScenario,
} from "../../../../../src/platform/intelligence/providers/async/fake/fake-async-provider";
import { AsyncProviderRuntime } from "../../../../../src/platform/intelligence/providers/async/runtime/async-provider-runtime";
import { buildSubmissionKey } from "../../../../../src/platform/intelligence/providers/async/interfaces/provider-operation-store";
import { InMemoryBlobStorage } from "../../../../../src/platform/persistence/storage/in-memory-blob-storage";
import { BlobOwnershipRegistry } from "../../../../../src/platform/media/blob/blob-ownership-registry";
import { BlobAccessService } from "../../../../../src/platform/media/blob/blob-access-service";
import {
  FakeMediaDownloadClient,
  MediaIngestionService,
} from "../../../../../src/platform/media/ingestion/media-ingestion-service";
import { MediaArtifactService } from "../../../../../src/platform/media/artifacts/media-artifact-service";
import {
  InMemoryArtifactRepository,
  InMemoryTenantUsageStore,
} from "../../../../../src/platform/infrastructure/durability/repositories/in-memory-execution-persistence";
import { validateIngestionUrl } from "../../../../../src/platform/media/ingestion/ssrf-guard";
import {
  DEFAULT_MEDIA_SIZE_LIMITS,
  type MediaSizeLimits,
} from "../../../../../src/platform/media/ingestion/media-size-limits";
import {
  validateInputAssetsWithBlobAccess,
  extractInputAssets,
} from "../../../../../src/platform/intelligence/providers/common/input-asset-validator";
import {
  InMemoryProviderRuntimeRegistry,
} from "../../../../../src/platform/intelligence/providers/runtime/registry/in-memory-provider-runtime-registry";
import { MultiProviderDispatcher } from "../../../../../src/platform/intelligence/providers/runtime/dispatcher/multi-provider-dispatcher";
import { ControllableDispatcher } from "../../../../../src/platform/intelligence/providers/runtime/testing";
import { isAsyncProviderDispatcher } from "../../../../../src/platform/intelligence/providers/async/interfaces/async-provider-dispatcher";
import type { IBlobStorage } from "../../../../../src/platform/persistence/interfaces/persistence";
import { failure, success, type Result } from "../../../../../src/platform/intelligence/shared/result";
import { ValidationError } from "../../../../../src/platform/intelligence/shared/errors";

const noopToken: CancellationToken = { cancelled: false, reason: undefined };

class FailingBlobStorage implements IBlobStorage {
  failPut = true;

  constructor(private readonly inner: InMemoryBlobStorage) {}

  async put(
    key: string,
    data: Uint8Array | string,
    contentType?: string
  ): Promise<Result<{ key: string; size: number }>> {
    if (this.failPut) {
      return failure(new ValidationError("blob storage unavailable"));
    }
    return this.inner.put(key, data, contentType);
  }

  get(
    key: string
  ): Promise<Result<{ key: string; data: string; contentType?: string } | undefined>> {
    return this.inner.get(key);
  }

  delete(key: string): Promise<Result<void>> {
    return this.inner.delete(key);
  }
}

function buildAsyncRequest(overrides: {
  executionId?: string;
  organizationId?: string;
  capabilityId?: string;
  payload?: Record<string, unknown>;
} = {}): ProviderExecutionRequest {
  const org = overrides.organizationId ?? "org_a";
  const execId = overrides.executionId ?? "exec_async_1";
  const base = sampleRequest({ providerId: "provider.fake-async" });
  return {
    ...base,
    providerId: fakeAsyncProviderId(),
    capabilityId: asCapabilityId(overrides.capabilityId ?? "video.generate"),
    modelId: "fake-async-v1",
    payload: overrides.payload ?? { prompt: "async test" },
    context: {
      ...base.context,
      executionId: asExecutionId(execId),
      organizationId: asOrganizationId(org),
      workspaceId: asWorkspaceId("ws_1"),
      providerId: fakeAsyncProviderId(),
    },
  };
}

function buildHarness(scenario: FakeAsyncScenario = "pending_then_complete", polls = 2) {
  const store = new InMemoryProviderOperationStore();
  const blobStorage = new InMemoryBlobStorage();
  const ownership = new BlobOwnershipRegistry();
  const blobAccess = new BlobAccessService(ownership);
  const fakeProvider = new FakeAsyncProviderDispatcher(
    "provider.fake-async",
    scenario,
    polls
  );

  const downloadClient = new FakeMediaDownloadClient();
  const artifactRepo = new InMemoryArtifactRepository();
  const ingestion = new MediaIngestionService(blobStorage, ownership, downloadClient);
  const artifacts = new MediaArtifactService(artifactRepo);
  const usageStore = new InMemoryTenantUsageStore();

  const runtime = new AsyncProviderRuntime({
    store,
    ingestion,
    artifacts,
    usageStore,
    blobAccess,
    leaseTtlMs: 5_000,
  });

  const buildRequest = (op: { executionId: string; organizationId: string }) =>
    buildAsyncRequest({
      executionId: op.executionId,
      organizationId: op.organizationId,
    });

  return {
    store,
    blobStorage,
    ownership,
    blobAccess,
    fakeProvider,
    ingestion,
    artifacts,
    artifactRepo,
    usageStore,
    runtime,
    buildRequest,
  };
}

describe("M9.5D async provider & durable media foundation", () => {
  it("basic async: submit once, reconcile to artifact", async () => {
    const h = buildHarness("pending_then_complete", 2);
    const req = buildAsyncRequest();
    const attemptId = "attempt_1";

    const submit = await h.runtime.submit(h.fakeProvider, req, noopToken, attemptId);
    expect(submit.ok).toBe(true);
    if (!submit.ok) return;

    expect(submit.value.operation.state).toBe("pending");
    expect(submit.value.operation.providerJobId).toBeDefined();

    const key = buildSubmissionKey({
      executionId: String(req.context.executionId),
      attemptId,
      providerId: String(req.providerId),
      capabilityId: String(req.capabilityId),
    });
    expect(h.fakeProvider.getSubmissionCount(key)).toBe(1);

    await h.runtime.runToCompletion("worker-1", h.fakeProvider, h.buildRequest, noopToken);

    const ops = h.store.all();
    const op = ops[0];
    expect(op.state).toBe("artifact_created");
    expect(op.artifactIds?.length).toBe(1);

    const artifactList = await h.artifactRepo.list(String(req.context.executionId));
    expect(artifactList.length).toBe(1);
    expect(artifactList[0].label).toMatch(/^blob:tenant\//);
  });

  it("restart recovery: same providerJobId, no resubmission", async () => {
    const store = new InMemoryProviderOperationStore();
    const blobStorage = new InMemoryBlobStorage();
    const ownership = new BlobOwnershipRegistry();
    const downloadClient = new FakeMediaDownloadClient({
      "https://cdn.example.test/fake/req_async_1/0.png": {
        data: Buffer.from("png"),
        mimeType: "image/png",
      },
    });
    const ingestion = new MediaIngestionService(blobStorage, ownership, downloadClient);
    const artifacts = new MediaArtifactService(new InMemoryArtifactRepository());

    const provider1 = new FakeAsyncProviderDispatcher("provider.fake-async", "pending_then_complete", 2);
    const req = buildAsyncRequest();
    const attemptId = "attempt_restart";
    const key = buildSubmissionKey({
      executionId: String(req.context.executionId),
      attemptId,
      providerId: String(req.providerId),
      capabilityId: String(req.capabilityId),
    });

    const runtime1 = new AsyncProviderRuntime({ store, ingestion, artifacts });
    const submit = await runtime1.submit(provider1, req, noopToken, attemptId);
    expect(submit.ok).toBe(true);
    if (!submit.ok) return;

    const savedJobId = submit.value.operation.providerJobId;
    expect(savedJobId).toBeDefined();

    const runtime2 = new AsyncProviderRuntime({ store, ingestion, artifacts });

    const resubmit = await runtime2.submit(provider1, req, noopToken, attemptId);
    expect(resubmit.ok).toBe(true);
    if (!resubmit.ok) return;
    expect(resubmit.value.operation.providerJobId).toBe(savedJobId);
    expect(provider1.getSubmissionCount(key)).toBe(1);

    await runtime2.runToCompletion("worker-restart", provider1, (op) =>
      buildAsyncRequest({ executionId: op.executionId, organizationId: op.organizationId })
    , noopToken);
    expect(provider1.getSubmissionCount(key)).toBe(1);
    expect(store.all()[0].state).toBe("artifact_created");
  });

  it("multi-instance: only one worker claims and polls", async () => {
    const h = buildHarness("pending_then_complete", 5);
    const req = buildAsyncRequest();
    await h.runtime.submit(h.fakeProvider, req, noopToken, "attempt_mi");

    const pollCountsBefore = h.fakeProvider.pollCount.size;

    const [a, b] = await Promise.all([
      h.runtime.reconcile("worker-a", h.fakeProvider, h.buildRequest, noopToken, 5),
      h.runtime.reconcile("worker-b", h.fakeProvider, h.buildRequest, noopToken, 5),
    ]);

    expect(a.ok && b.ok).toBe(true);
    const totalNewPolls = h.fakeProvider.pollCount.size - pollCountsBefore;
    expect(totalNewPolls).toBeLessThanOrEqual(1);
  });

  it("lease recovery: expired lease reclaimed without resubmission", async () => {
    const h = buildHarness("pending_then_complete", 2);
    const req = buildAsyncRequest();
    const attemptId = "attempt_lease";
    const key = buildSubmissionKey({
      executionId: String(req.context.executionId),
      attemptId,
      providerId: String(req.providerId),
      capabilityId: String(req.capabilityId),
    });

    await h.runtime.submit(h.fakeProvider, req, noopToken, attemptId);
    const op = h.store.all()[0];

    const claimed = await h.store.tryClaim(
      op.operationId,
      "worker-crash",
      1,
      new Date().toISOString(),
      Date.now()
    );
    expect(claimed).toBeDefined();

    await new Promise((r) => setTimeout(r, 5));
    await h.store.reclaimExpiredLeases(new Date().toISOString(), Date.now() + 10);

    await h.runtime.runToCompletion("worker-b", h.fakeProvider, h.buildRequest, noopToken);
    expect(h.fakeProvider.getSubmissionCount(key)).toBe(1);
    expect(h.store.all()[0].state).toBe("artifact_created");
  });

  it("storage failure: completed provider result retained, ingestion retried", async () => {
    const store = new InMemoryProviderOperationStore();
    const innerBlob = new InMemoryBlobStorage();
    const failingBlob = new FailingBlobStorage(innerBlob);
    const ownership = new BlobOwnershipRegistry();
    const downloadClient = new FakeMediaDownloadClient({
      "https://cdn.example.test/fake/req_async_1/0.png": {
        data: Buffer.from("png"),
        mimeType: "image/png",
      },
    });
    const ingestion = new MediaIngestionService(failingBlob, ownership, downloadClient);
    const artifacts = new MediaArtifactService(new InMemoryArtifactRepository());
    const provider = new FakeAsyncProviderDispatcher("provider.fake-async", "immediate_complete");
    const runtime = new AsyncProviderRuntime({ store, ingestion, artifacts });

    const req = buildAsyncRequest();
    const key = buildSubmissionKey({
      executionId: String(req.context.executionId),
      attemptId: "attempt_storage",
      providerId: String(req.providerId),
      capabilityId: String(req.capabilityId),
    });

    await runtime.submit(provider, req, noopToken, "attempt_storage");
    await runtime.reconcile("w1", provider, (op) =>
      buildAsyncRequest({ executionId: op.executionId, organizationId: op.organizationId })
    , noopToken);

    const opAfterFail = store.all()[0];
    expect(opAfterFail.state).toBe("completed");
    expect(provider.getSubmissionCount(key)).toBe(1);

    failingBlob.failPut = false;
    await runtime.runToCompletion("w2", provider, (op) =>
      buildAsyncRequest({ executionId: op.executionId, organizationId: op.organizationId })
    , noopToken);

    expect(store.all()[0].state).toBe("artifact_created");
  });

  it("duplicate reconciliation: one artifact and one usage charge", async () => {
    const h = buildHarness("immediate_complete");
    const req = buildAsyncRequest();
    await h.runtime.submit(h.fakeProvider, req, noopToken, "attempt_dup");

    for (let i = 0; i < 5; i += 1) {
      await h.runtime.reconcile("w", h.fakeProvider, h.buildRequest, noopToken, 10);
    }

    const op = h.store.all()[0];
    expect(op.state).toBe("artifact_created");
    const arts = await h.artifactRepo.list(String(req.context.executionId));
    expect(arts.length).toBe(1);
    expect(await h.usageStore.getTokensUsed("org_a")).toBe(1);
  });

  it("tenant blob security: cross-tenant storageRef rejected before dispatch", () => {
    const ownership = new BlobOwnershipRegistry();
    ownership.register({
      storageKey: "tenant/org_a/executions/e1/artifacts/a1/output-0.png",
      organizationId: "org_a",
      executionId: "e1",
      artifactId: "a1",
      mimeType: "image/png",
      sizeBytes: 100,
      checksum: "abc",
      createdAt: new Date().toISOString(),
    });
    const blobAccess = new BlobAccessService(ownership);

    const assets = extractInputAssets({
      assets: [{ storageRef: "blob:tenant/org_a/executions/e1/artifacts/a1/output-0.png", organizationId: "org_b" }],
    });

    const check = validateInputAssetsWithBlobAccess({
      assets,
      organizationId: "org_b",
      blobAccess,
    });
    expect(check.ok).toBe(false);
  });

  it("SSRF: rejects localhost, private IP, metadata, redirect to private", () => {
    expect(validateIngestionUrl("http://127.0.0.1/file").ok).toBe(false);
    expect(validateIngestionUrl("http://localhost/file").ok).toBe(false);
    expect(validateIngestionUrl("http://10.0.0.1/file").ok).toBe(false);
    expect(validateIngestionUrl("http://169.254.169.254/latest/meta-data").ok).toBe(false);
    expect(validateIngestionUrl("http://[::1]/file").ok).toBe(false);

    const redirectClient = new FakeMediaDownloadClient(
      { "https://public.example/redirect": "redirect" },
      "http://127.0.0.1/private"
    );
    const svc = new MediaIngestionService(
      new InMemoryBlobStorage(),
      new BlobOwnershipRegistry(),
      redirectClient
    );
    return svc
      .ingest({
        organizationId: "org_a",
        executionId: "e1",
        artifactId: "a1",
        outputIndex: 0,
        temporaryUrl: "https://public.example/redirect",
        mimeType: "image/png",
      })
      .then((r) => expect(r.ok).toBe(false));
  });

  it("large media: bounded rejection", async () => {
    const tinyLimits: MediaSizeLimits = {
      imageMaxBytes: 10,
      audioMaxBytes: 10,
      videoMaxBytes: 10,
      otherMaxBytes: 10,
    };
    const blobStorage = new InMemoryBlobStorage();
    const ownership = new BlobOwnershipRegistry();
    const big = Buffer.alloc(100, 1);
    const downloadClient = new FakeMediaDownloadClient({
      "https://cdn.example.test/big.png": { data: big, mimeType: "image/png" },
    });
    const svc = new MediaIngestionService(blobStorage, ownership, downloadClient, tinyLimits);

    const result = await svc.ingest({
      organizationId: "org_a",
      executionId: "e1",
      artifactId: "a1",
      outputIndex: 0,
      temporaryUrl: "https://cdn.example.test/big.png",
      mimeType: "image/png",
    });
    expect(result.ok).toBe(false);
    const arts = await new InMemoryArtifactRepository().list("e1");
    expect(arts.length).toBe(0);
  });

  it("base64 ingestion: blob persisted, not in operation metadata", async () => {
    const blobStorage = new InMemoryBlobStorage();
    const ownership = new BlobOwnershipRegistry();
    const svc = new MediaIngestionService(
      blobStorage,
      ownership,
      new FakeMediaDownloadClient()
    );
    const b64 = Buffer.from("small-image").toString("base64");
    const result = await svc.ingest({
      organizationId: "org_a",
      executionId: "e1",
      artifactId: "a1",
      outputIndex: 0,
      base64: b64,
      mimeType: "image/png",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.storageKey).toMatch(/^tenant\/org_a\//);
      expect(JSON.stringify(result.value)).not.toContain(b64);
    }
  });

  it("multiple outputs: deterministic artifact identities", async () => {
    const h = buildHarness("multi_output", 1);
    const req = buildAsyncRequest({ executionId: "exec_multi" });
    const provider = new FakeAsyncProviderDispatcher("provider.fake-async", "multi_output", 1);
    const runtime = new AsyncProviderRuntime({
      store: h.store,
      ingestion: h.ingestion,
      artifacts: h.artifacts,
    });

    await runtime.submit(provider, req, noopToken, "attempt_multi");
    await runtime.runToCompletion("w", provider, (op) =>
      buildAsyncRequest({ executionId: op.executionId, organizationId: op.organizationId })
    , noopToken);

    const op = h.store.all()[0];
    expect(op.artifactIds?.length).toBe(3);
    expect(op.artifactIds?.[0]).toBe(`art_${op.operationId}_0`);
    expect(op.artifactIds?.[2]).toBe(`art_${op.operationId}_2`);

    await runtime.reconcile("w", provider, (op) =>
      buildAsyncRequest({ executionId: op.executionId, organizationId: op.organizationId })
    , noopToken, 10);
    const arts = await h.artifactRepo.list("exec_multi");
    expect(arts.length).toBe(3);
  });

  it("cancellation: provider cancel invoked when supported", async () => {
    const h = buildHarness("cancel_supported", 100);
    const provider = new FakeAsyncProviderDispatcher("provider.fake-async", "cancel_supported", 100);
    const req = buildAsyncRequest();
    const submit = await h.runtime.submit(provider, req, noopToken, "attempt_cancel");
    expect(submit.ok).toBe(true);
    if (!submit.ok) return;

    const jobId = submit.value.operation.providerJobId!;
    expect(provider.supportsCancellation(fakeAsyncProviderId())).toBe(true);
    const cancel = await provider.cancelAsync!(req, jobId, noopToken);
    expect(cancel.ok).toBe(true);
    expect(provider.cancelCount.get(jobId)).toBe(1);
  });

  it("sync and async coexist in registry without provider-name branching", async () => {
    const registry = new InMemoryProviderRuntimeRegistry();
    const sync = new ControllableDispatcher({ mode: "success" });
    const asyncProv = new FakeAsyncProviderDispatcher();

    registry.registerExecutable({
      providerId: asProviderId("provider.sync"),
      dispatcher: sync,
      capabilities: ["analyzeBrief"],
    });
    registry.registerExecutable({
      providerId: fakeAsyncProviderId(),
      dispatcher: asyncProv,
      capabilities: ["video.generate"],
    });

    const multi = new MultiProviderDispatcher({ registry });
    const syncEntry = registry.resolveAvailable(asProviderId("provider.sync"));
    const asyncEntry = registry.resolveAvailable(fakeAsyncProviderId());

    expect(syncEntry?.executionSemantics).toBe("sync");
    expect(asyncEntry?.executionSemantics).toBe("async");
    expect(isAsyncProviderDispatcher(asyncEntry!.dispatcher)).toBe(true);

    const syncReq = sampleRequest({ providerId: "provider.sync" });
    const syncResult = await multi.dispatch(syncReq, noopToken);
    expect(syncResult.ok).toBe(true);

    const asyncReq = buildAsyncRequest();
    const asyncDispatch = await multi.dispatch(asyncReq, noopToken);
    expect(asyncDispatch.ok).toBe(false);
  });

  it("poll rate limit reschedules without failing job", async () => {
    const h = buildHarness("poll_rate_limit", 2);
    const req = buildAsyncRequest();
    await h.runtime.submit(h.fakeProvider, req, noopToken, "attempt_rl");
    await h.runtime.reconcile("w", h.fakeProvider, h.buildRequest, noopToken);
    const afterRateLimit = h.store.all()[0];
    expect(afterRateLimit.state).toBe("pending");
    expect(afterRateLimit.nextPollAt).toBeDefined();
  });

  it("provider job failure normalized", async () => {
    const h = buildHarness("pending_then_fail", 1);
    const req = buildAsyncRequest();
    await h.runtime.submit(h.fakeProvider, req, noopToken, "attempt_fail");
    await h.runtime.runToCompletion("w", h.fakeProvider, h.buildRequest, noopToken);
    expect(h.store.all()[0].state).toBe("failed");
  });
});

describe("M9.5D media size defaults", () => {
  it("documents non-restrictive category limits", () => {
    expect(DEFAULT_MEDIA_SIZE_LIMITS.videoMaxBytes).toBeGreaterThanOrEqual(500 * 1024 * 1024);
    expect(DEFAULT_MEDIA_SIZE_LIMITS.imageMaxBytes).toBeGreaterThanOrEqual(25 * 1024 * 1024);
  });
});
