/**
 * M9.5D1 — production async durability & media storage certification.
 */

import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoProviderOperationStore } from "../../../../../src/platform/intelligence/providers/async/store/mongo-provider-operation-store";
import { InMemoryProviderOperationStore } from "../../../../../src/platform/intelligence/providers/async/store/in-memory-provider-operation-store";
import {
  FakeAsyncProviderDispatcher,
} from "../../../../../src/platform/intelligence/providers/async/fake/fake-async-provider";
import { sampleRequest } from "../../../../../src/platform/intelligence/providers/runtime/testing";
import {
  asCapabilityId,
  asExecutionId,
  asOrganizationId,
  asProviderId,
  asWorkspaceId,
} from "../../../../../src/platform/intelligence/shared/identifiers";
import {
  createAsyncMediaPlatform,
} from "../../../../../src/platform/infrastructure/durability/create-async-media-platform";
import {
  InMemoryArtifactRepository,
  InMemoryTenantUsageStore,
} from "../../../../../src/platform/infrastructure/durability/repositories/in-memory-execution-persistence";
import {
  MongoBlobMetadataRepository,
  InMemoryBlobMetadataRepository,
} from "../../../../../src/platform/media/blob/blob-metadata-repository";
import { BlobAccessService } from "../../../../../src/platform/media/blob/blob-access-service";
import { RecordingS3BlobStorage } from "../../../../../src/platform/persistence/storage/s3-blob-storage";
import { createDurableStores } from "../../../../../src/platform/infrastructure/durability/create-durable-stores";
import { EnterpriseProviderOperation } from "../../../../../src/platform/infrastructure/durability/mongo/models/enterprise-provider-operation.model";
import { EnterpriseBlobMetadata } from "../../../../../src/platform/infrastructure/durability/mongo/models/enterprise-blob-metadata.model";
import type { ProviderOperationRecord } from "../../../../../src/platform/intelligence/providers/async/contracts/provider-operation";
import { buildSubmissionKey } from "../../../../../src/platform/intelligence/providers/async/interfaces/provider-operation-store";

const noopToken = { cancelled: false, reason: undefined };

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await EnterpriseProviderOperation.createIndexes();
  await EnterpriseBlobMetadata.createIndexes();
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

function baseRecord(overrides: Partial<ProviderOperationRecord> = {}): ProviderOperationRecord {
  const now = new Date().toISOString();
  return {
    operationId: `op_${Math.random().toString(36).slice(2, 8)}`,
    executionId: `exec_${Math.random().toString(36).slice(2, 8)}`,
    attemptId: "attempt_1",
    organizationId: "org_a",
    workspaceId: "ws_1",
    providerId: "provider.fake-async",
    modelId: "fake-v1",
    capabilityId: "video.generate",
    submissionKey: `sk_${Math.random().toString(36).slice(2, 10)}`,
    state: "pending",
    idempotencyKey: `idem_${Math.random().toString(36).slice(2, 10)}`,
    pollCount: 0,
    providerJobId: "fake_job_1",
    nextPollAt: new Date(0).toISOString(),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("M9.5D1 Mongo provider operation store", () => {
  it("enforces submissionKey uniqueness atomically", async () => {
    const store = new MongoProviderOperationStore();
    const key = baseRecord().submissionKey;
    const rec = baseRecord({ submissionKey: key, idempotencyKey: key });
    await store.create(rec);
    await expect(
      store.create({ ...baseRecord(), submissionKey: key, idempotencyKey: key })
    ).rejects.toThrow(/duplicate provider operation submissionKey/);
  });

  it("atomic claim — only one worker wins", async () => {
    const store = new MongoProviderOperationStore();
    const rec = baseRecord();
    await store.create(rec);
    const now = Date.now();
    const [a, b] = await Promise.all([
      store.tryClaim(rec.operationId, "worker-a", 30_000, new Date().toISOString(), now),
      store.tryClaim(rec.operationId, "worker-b", 30_000, new Date().toISOString(), now),
    ]);
    expect([a, b].filter(Boolean).length).toBe(1);
  });

  it("lease recovery without losing providerJobId", async () => {
    const store = new MongoProviderOperationStore();
    const rec = baseRecord();
    await store.create(rec);
    const now = Date.now();
    await store.tryClaim(rec.operationId, "worker-dead", 1, new Date().toISOString(), now);
    await store.reclaimExpiredLeases(new Date().toISOString(), now + 10);
    const loaded = await store.get(rec.operationId);
    expect(loaded?.providerJobId).toBe("fake_job_1");
    expect(loaded?.leaseOwner).toBeUndefined();
  });

  it("restart: same operationId and providerJobId after new store instance", async () => {
    const store1 = new MongoProviderOperationStore();
    const rec = baseRecord();
    await store1.create(rec);
    const store2 = new MongoProviderOperationStore();
    const loaded = await store2.get(rec.operationId);
    expect(loaded?.providerJobId).toBe("fake_job_1");
  });

  it("does not persist base64 in Mongo outputs", async () => {
    const store = new MongoProviderOperationStore();
    const rec = baseRecord({
      state: "completed",
      outputs: [
        {
          index: 0,
          type: "image",
          mimeType: "image/png",
          base64: "should-not-persist",
          temporaryUrl: "https://cdn.example.test/x.png",
        },
      ],
    });
    await store.create(rec);
    const loaded = await store.get(rec.operationId);
    expect(JSON.stringify(loaded?.outputs)).not.toContain("should-not-persist");
  });

  it("race: concurrent create same submissionKey — one wins", async () => {
    const store = new MongoProviderOperationStore();
    const key = `race_${Date.now()}`;
    const results = await Promise.allSettled([
      store.create(baseRecord({ submissionKey: key, idempotencyKey: key })),
      store.create(baseRecord({ submissionKey: key, idempotencyKey: key })),
    ]);
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(1);
    expect(results.filter((r) => r.status === "rejected").length).toBe(1);
  });
});

describe("M9.5D1 blob ownership durability", () => {
  it("ownership survives restart via Mongo metadata", async () => {
    const repo1 = new MongoBlobMetadataRepository();
    const key = `tenant/org_a/executions/e1/artifacts/a1/output-0.png`;
    await repo1.register({
      storageKey: key,
      organizationId: "org_a",
      executionId: "e1",
      artifactId: "a1",
      mimeType: "image/png",
      sizeBytes: 10,
      checksum: "abc",
      createdAt: new Date().toISOString(),
    });
    const repo2 = new MongoBlobMetadataRepository();
    const access = new BlobAccessService(repo2, new RecordingS3BlobStorage());
    expect((await access.resolveForTenantAsync(`blob:${key}`, "org_a")).ok).toBe(true);
    expect((await access.resolveForTenantAsync(`blob:${key}`, "org_b")).ok).toBe(false);
  });

  it("signed URL tenant authorization", async () => {
    const repo = new MongoBlobMetadataRepository();
    const blob = new RecordingS3BlobStorage();
    const key = "tenant/org_a/x.png";
    await blob.put(key, Buffer.from("x"), "image/png");
    await repo.register({
      storageKey: key,
      organizationId: "org_a",
      executionId: "e1",
      artifactId: "a1",
      mimeType: "image/png",
      sizeBytes: 1,
      checksum: "x",
      createdAt: new Date().toISOString(),
    });
    const access = new BlobAccessService(repo, blob, 60);
    expect((await access.createProviderInputSignedUrl(`blob:${key}`, "org_a")).ok).toBe(true);
    expect((await access.createProviderInputSignedUrl(`blob:${key}`, "org_b")).ok).toBe(false);
  });
});

describe("M9.5D1 production composition", () => {
  it("durable async mode uses Mongo store + recording S3 in tests", () => {
    const platform = createAsyncMediaPlatform({
      forceInMemory: false,
      env: {
        ENTERPRISE_API_DURABLE_MODE: "true",
        ENTERPRISE_ASYNC_MEDIA_ENABLED: "true",
        ENTERPRISE_BLOB_BUCKET: "test-bucket",
        AWS_REGION: "ap-south-1",
      },
      artifactsRepo: new InMemoryArtifactRepository(),
      recordingBlobStorage: new RecordingS3BlobStorage(),
    });
    expect(platform.isProductionBacked).toBe(true);
    expect(platform.providerOperations).toBeInstanceOf(MongoProviderOperationStore);
  });

  it("non-durable mode uses in-memory stores", () => {
    const platform = createAsyncMediaPlatform({
      forceInMemory: true,
      artifactsRepo: new InMemoryArtifactRepository(),
    });
    expect(platform.isProductionBacked).toBe(false);
    expect(platform.providerOperations).toBeInstanceOf(InMemoryProviderOperationStore);
    expect(platform.blobMetadata).toBeInstanceOf(InMemoryBlobMetadataRepository);
  });

  it("fail-closed: durable async without bucket throws", () => {
    expect(() =>
      createDurableStores({
        ENTERPRISE_API_DURABLE_MODE: "true",
        ENTERPRISE_ASYNC_MEDIA_ENABLED: "true",
      } as NodeJS.ProcessEnv)
    ).toThrow(/blob storage/i);
  });
});

describe("M9.5D1 end-to-end async with production stores", () => {
  it("submit once, reconcile to artifact with Mongo + recording S3", async () => {
    const recording = new RecordingS3BlobStorage();
    const artifacts = new InMemoryArtifactRepository();
    const platform = createAsyncMediaPlatform({
      env: {
        ENTERPRISE_API_DURABLE_MODE: "true",
        ENTERPRISE_ASYNC_MEDIA_ENABLED: "true",
        ENTERPRISE_BLOB_BUCKET: "test-bucket",
      },
      artifactsRepo: artifacts,
      tenantUsage: new InMemoryTenantUsageStore(),
      recordingBlobStorage: recording,
    });
    const provider = new FakeAsyncProviderDispatcher("provider.fake-async", "pending_then_complete", 2);
    const execId = `exec_mongo_${Date.now()}`;
    const req = {
      ...sampleRequest({ providerId: "provider.fake-async" }),
      providerId: asProviderId("provider.fake-async"),
      capabilityId: asCapabilityId("video.generate"),
      context: {
        ...sampleRequest().context,
        executionId: asExecutionId(execId),
        organizationId: asOrganizationId("org_a"),
        workspaceId: asWorkspaceId("ws_1"),
      },
    };
    const submit = await platform.runtime.submit(provider, req, noopToken, "attempt_e2e");
    expect(submit.ok).toBe(true);
    await platform.runtime.runToCompletion("w", provider, () => req, noopToken);

    const op = await platform.providerOperations.getByExecutionId(execId);
    expect(op?.state).toBe("artifact_created");
    expect(recording.objects.size).toBeGreaterThan(0);
    expect((await artifacts.list(execId)).length).toBe(1);
  });
});
