/**
 * M9.5E — video provider activation certification.
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
import { MongoProviderOperationStore } from "../../../../../src/platform/intelligence/providers/async/store/mongo-provider-operation-store";
import { AsyncProviderRuntime } from "../../../../../src/platform/intelligence/providers/async/runtime/async-provider-runtime";
import { buildSubmissionKey } from "../../../../../src/platform/intelligence/providers/async/interfaces/provider-operation-store";
import { InMemoryBlobStorage } from "../../../../../src/platform/persistence/storage/in-memory-blob-storage";
import { RecordingS3BlobStorage } from "../../../../../src/platform/persistence/storage/s3-blob-storage";
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
import { MongoArtifactRepository } from "../../../../../src/platform/infrastructure/durability/repositories/mongo-execution-persistence";
import { validateIngestionUrl } from "../../../../../src/platform/media/ingestion/ssrf-guard";
import { InMemoryProviderRuntimeRegistry } from "../../../../../src/platform/intelligence/providers/runtime/registry/in-memory-provider-runtime-registry";
import { MultiProviderDispatcher } from "../../../../../src/platform/intelligence/providers/runtime/dispatcher/multi-provider-dispatcher";
import { createModelRegistryPlatform } from "../../../../../src/platform/intelligence/model-registry/factories/create-model-registry-platform";
import { registerVideoProviders } from "../../../../../src/platform/production/execution/register-video-providers";
import {
  RUNWAY_VIDEO_CONFIG,
  KLING_VIDEO_CONFIG,
  LUMA_VIDEO_CONFIG,
  PIKA_VIDEO_CONFIG,
  ALL_VIDEO_PROVIDER_CONFIGS,
} from "../../../../../src/platform/intelligence/providers/video/configs/video-provider-configs";
import { createCatalogVideoProvider } from "../../../../../src/platform/intelligence/providers/video/factories/create-catalog-video-provider";
import { FakeVideoHttpClient } from "../../../../../src/platform/intelligence/providers/video/http/fake-video-http-client";
import { CatalogAsyncVideoDispatcher } from "../../../../../src/platform/intelligence/providers/video/dispatcher/catalog-async-video-dispatcher";
import { failure, success, type Result } from "../../../../../src/platform/intelligence/shared/result";
import { ValidationError } from "../../../../../src/platform/intelligence/shared/errors";
import type { IBlobStorage } from "../../../../../src/platform/persistence/interfaces/persistence";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

const noopToken: CancellationToken = { cancelled: false, reason: undefined };

function buildVideoRequest(input: {
  providerId: string;
  modelId: string;
  executionId?: string;
  organizationId?: string;
  payload?: Record<string, unknown>;
}): ProviderExecutionRequest {
  const base = sampleRequest({ providerId: input.providerId });
  return {
    ...base,
    providerId: asProviderId(input.providerId),
    modelId: input.modelId,
    capabilityId: asCapabilityId("video.generate"),
    payload: input.payload ?? { prompt: "A cinematic product reveal" },
    context: {
      ...base.context,
      executionId: asExecutionId(input.executionId ?? "exec_video_1"),
      organizationId: asOrganizationId(input.organizationId ?? "org_a"),
      workspaceId: asWorkspaceId("ws_1"),
      providerId: asProviderId(input.providerId),
    },
  };
}

function createVideoLeaf(
  config: typeof RUNWAY_VIDEO_CONFIG,
  polls = 2,
  options?: {
    withSignedUrls?: boolean;
    ownership?: BlobOwnershipRegistry;
    blobStorage?: RecordingS3BlobStorage;
  }
) {
  const ownership = options?.ownership ?? new BlobOwnershipRegistry();
  const blobStorage =
    options?.blobStorage ??
    (options?.withSignedUrls ? new RecordingS3BlobStorage() : undefined);
  const blobAccess = new BlobAccessService(ownership, blobStorage);
  const http = new FakeVideoHttpClient(config, config.contract, polls);
  const platform = createCatalogVideoProvider({
    config,
    mode: "simulated",
    httpClient: http,
    blobAccess,
  });
  if (!platform.ok) throw new Error(platform.error.message);
  return { dispatcher: platform.value.dispatcher, http, blobAccess, ownership };
}

describe("M9.5E video provider activation", () => {
  describe("inventory-backed provider contract tests", () => {
    for (const config of [RUNWAY_VIDEO_CONFIG, KLING_VIDEO_CONFIG, LUMA_VIDEO_CONFIG]) {
      it(`${config.vendor} — submit, poll complete, usage, result mapping`, async () => {
        const { dispatcher, http } = createVideoLeaf(config);
        const req = buildVideoRequest({
          providerId: config.canonicalProviderId,
          modelId: `${config.vendor}/${config.wireModels[0]!.inventoryModelId}`,
        });
        const submit = await dispatcher.submitAsync(req, noopToken, "idem_1");
        expect(submit.ok).toBe(true);
        if (!submit.ok) return;
        expect(submit.value.providerJobId).toBeTruthy();
        expect(submit.value.status).toBe("pending");

        let completed = false;
        for (let i = 0; i < 5; i++) {
          const poll = await dispatcher.pollAsync(req, submit.value.providerJobId, noopToken);
          expect(poll.ok).toBe(true);
          if (!poll.ok) return;
          if (poll.value.status === "completed") {
            completed = true;
            expect(poll.value.outputs?.[0]?.type).toBe("video");
            expect(poll.value.outputs?.[0]?.mimeType).toBe("video/mp4");
            expect(poll.value.usage?.videoSeconds).toBe(4);
            break;
          }
        }
        expect(completed).toBe(true);
        expect(http.pollCount.size).toBeGreaterThan(0);
      });
    }
  });

  describe("multi-provider certification via MultiProviderDispatcher", () => {
    it("routes runway, kling, luma through shared runtime registry", async () => {
      const registryPlatform = createModelRegistryPlatform({ loadSeed: true });
      const registry = new InMemoryProviderRuntimeRegistry();
      const injected = ALL_VIDEO_PROVIDER_CONFIGS.slice(0, 3).map((config) => {
        const leaf = createVideoLeaf(config);
        return {
          providerId: asProviderId(config.canonicalProviderId),
          dispatcher: leaf.dispatcher,
          mode: "simulated" as const,
        };
      });

      const registered = registerVideoProviders({
        executionMode: "openai_simulated",
        modelRegistry: registryPlatform.registry,
        registry,
        injectedProviders: injected,
      });
      expect(registered.ok).toBe(true);

      const dispatcher = new MultiProviderDispatcher({ registry });
      for (const config of ALL_VIDEO_PROVIDER_CONFIGS.slice(0, 3)) {
        const entry = registry.resolveAvailable(asProviderId(config.canonicalProviderId));
        expect(entry?.dispatcher).toBeDefined();
        const req = buildVideoRequest({
          providerId: config.canonicalProviderId,
          modelId: `${config.vendor}/${config.wireModels[0]!.inventoryModelId}`,
          executionId: `exec_${config.vendor}`,
        });
        const routed = await dispatcher.dispatch(req, noopToken);
        expect(routed.ok).toBe(false);
        expect(routed.error.message.toLowerCase()).toContain("async");
      }
    });
  });

  describe("text-to-video E2E async pipeline", () => {
    it("submit → poll → ingest → durable artifact", async () => {
      const store = new InMemoryProviderOperationStore();
      const blobStorage = new InMemoryBlobStorage();
      const ownership = new BlobOwnershipRegistry();
      const blobAccess = new BlobAccessService(ownership);
      const { dispatcher } = createVideoLeaf(RUNWAY_VIDEO_CONFIG);
      const videoUrl = "https://cdn.example.test/runway/vid_job_runway_1.mp4";
      const downloadClient = new FakeMediaDownloadClient(
        { [videoUrl]: { data: Buffer.from("fake-mp4-bytes"), mimeType: "video/mp4" } },
        undefined,
        { data: Buffer.from("fake-mp4-bytes"), mimeType: "video/mp4" }
      );
      const artifactRepo = new InMemoryArtifactRepository();
      const ingestion = new MediaIngestionService(blobStorage, ownership, downloadClient);
      const artifacts = new MediaArtifactService(artifactRepo);
      const runtime = new AsyncProviderRuntime({
        store,
        ingestion,
        artifacts,
        blobAccess,
      });

      const req = buildVideoRequest({
        providerId: RUNWAY_VIDEO_CONFIG.canonicalProviderId,
        modelId: "runway/runway-gen-4",
      });

      const submit = await runtime.submit(dispatcher, req, noopToken, "attempt_1");
      expect(submit.ok).toBe(true);
      if (!submit.ok) return;

      await runtime.runToCompletion(
        "worker-video-e2e",
        dispatcher,
        (op) =>
          buildVideoRequest({
            providerId: RUNWAY_VIDEO_CONFIG.canonicalProviderId,
            modelId: "runway/runway-gen-4",
            executionId: op.executionId,
            organizationId: op.organizationId,
          }),
        noopToken
      );

      const finalOp = await store.get(submit.value.operation.operationId);
      expect(finalOp?.state).toBe("artifact_created");
      expect(finalOp?.artifactIds?.length).toBe(1);
    });
  });

  describe("image-to-video tenant security", () => {
    it("tenant A image succeeds; tenant B rejected before provider submit", async () => {
      const store = new InMemoryProviderOperationStore();
      const ownership = new BlobOwnershipRegistry();
      const imageKey = "tenant/org_a/images/src.png";
      ownership.register({
        storageKey: imageKey,
        organizationId: "org_a",
        executionId: "exec_a",
        artifactId: "art_src",
        mimeType: "image/png",
        sizeBytes: 100,
        checksum: "abc",
        createdAt: new Date().toISOString(),
      });
      const blobStorage = new RecordingS3BlobStorage();
      await blobStorage.put(imageKey, Buffer.from("png"), "image/png");
      const { dispatcher } = createVideoLeaf(KLING_VIDEO_CONFIG, 2, {
        withSignedUrls: true,
        ownership,
        blobStorage,
      });

      const runtime = new AsyncProviderRuntime({
        store,
        ingestion: new MediaIngestionService(
          new InMemoryBlobStorage(),
          ownership,
          new FakeMediaDownloadClient()
        ),
        artifacts: new MediaArtifactService(new InMemoryArtifactRepository()),
        blobAccess: new BlobAccessService(ownership),
      });

      const okReq = buildVideoRequest({
        providerId: KLING_VIDEO_CONFIG.canonicalProviderId,
        modelId: "kling/kling-2-1",
        organizationId: "org_a",
        payload: {
          prompt: "animate",
          image: { storageRef: "blob:tenant/org_a/images/src.png" },
        },
      });
      const okSubmit = await runtime.submit(dispatcher, okReq, noopToken, "attempt_a");
      expect(okSubmit.ok).toBe(true);

      const badReq = buildVideoRequest({
        providerId: KLING_VIDEO_CONFIG.canonicalProviderId,
        modelId: "kling/kling-2-1",
        organizationId: "org_b",
        payload: {
          prompt: "animate",
          image: { storageRef: "blob:tenant/org_a/images/src.png" },
        },
      });
      const badSubmit = await runtime.submit(dispatcher, badReq, noopToken, "attempt_b");
      expect(badSubmit.ok).toBe(false);
    });
  });

  describe("restart recovery", () => {
    it("preserves providerJobId and does not resubmit after restart", async () => {
      const store = new InMemoryProviderOperationStore();
      const { dispatcher, http } = createVideoLeaf(LUMA_VIDEO_CONFIG);
      const runtime = new AsyncProviderRuntime({
        store,
        ingestion: new MediaIngestionService(
          new InMemoryBlobStorage(),
          new BlobOwnershipRegistry(),
          new FakeMediaDownloadClient({}, undefined, {
            data: Buffer.from("v"),
            mimeType: "video/mp4",
          })
        ),
        artifacts: new MediaArtifactService(new InMemoryArtifactRepository()),
      });

      const req = buildVideoRequest({
        providerId: LUMA_VIDEO_CONFIG.canonicalProviderId,
        modelId: "luma/luma-ray-2",
      });
      const submit = await runtime.submit(dispatcher, req, noopToken, "attempt_restart");
      expect(submit.ok).toBe(true);
      if (!submit.ok) return;
      const jobId = submit.value.operation.providerJobId;
      expect(jobId).toBeTruthy();

      const runtime2 = new AsyncProviderRuntime({
        store,
        ingestion: new MediaIngestionService(
          new InMemoryBlobStorage(),
          new BlobOwnershipRegistry(),
          new FakeMediaDownloadClient({}, undefined, {
            data: Buffer.from("v"),
            mimeType: "video/mp4",
          })
        ),
        artifacts: new MediaArtifactService(new InMemoryArtifactRepository()),
      });

      const done = await runtime2.runToCompletion(
        "worker-restart",
        dispatcher,
        (op) =>
          buildVideoRequest({
            providerId: LUMA_VIDEO_CONFIG.canonicalProviderId,
            modelId: "luma/luma-ray-2",
            executionId: op.executionId,
            organizationId: op.organizationId,
          }),
        noopToken
      );
      expect(done).toBeUndefined();
      expect(http.submitCount.get(buildSubmissionKey({
        executionId: req.context.executionId as string,
        attemptId: "attempt_restart",
        providerId: LUMA_VIDEO_CONFIG.canonicalProviderId,
        capabilityId: "video.generate",
      }))).toBe(1);
    });
  });

  describe("durable artifact idempotency", () => {
    let mongo: MongoMemoryServer;

    beforeAll(async () => {
      mongo = await MongoMemoryServer.create();
      await mongoose.connect(mongo.getUri());
    }, 60_000);

    afterAll(async () => {
      await mongoose.disconnect();
      await mongo.stop();
    });

    it("two workers finalize one logical artifact (Mongo unique artifactId)", async () => {
      const store = new MongoProviderOperationStore();
      const artifactRepo = new MongoArtifactRepository();
      const artifacts = new MediaArtifactService(artifactRepo);
      const blobStorage = new InMemoryBlobStorage();
      const ownership = new BlobOwnershipRegistry();
      const ingestion = new MediaIngestionService(
        blobStorage,
        ownership,
        new FakeMediaDownloadClient({}, undefined, {
          data: Buffer.from("video"),
          mimeType: "video/mp4",
        })
      );
      const runtime = new AsyncProviderRuntime({ store, ingestion, artifacts });
      const { dispatcher } = createVideoLeaf(PIKA_VIDEO_CONFIG);

      const req = buildVideoRequest({
        providerId: PIKA_VIDEO_CONFIG.canonicalProviderId,
        modelId: "pika/pika-2-2",
        executionId: "exec_race",
      });
      const submit = await runtime.submit(dispatcher, req, noopToken, "attempt_race");
      expect(submit.ok).toBe(true);
      if (!submit.ok) return;

      const opId = submit.value.operation.operationId;
      await Promise.all([
        runtime.runToCompletion(
          "worker-a",
          dispatcher,
          (op) =>
            buildVideoRequest({
              providerId: PIKA_VIDEO_CONFIG.canonicalProviderId,
              modelId: "pika/pika-2-2",
              executionId: op.executionId,
              organizationId: op.organizationId,
            }),
          noopToken
        ),
        runtime.runToCompletion(
          "worker-b",
          dispatcher,
          (op) =>
            buildVideoRequest({
              providerId: PIKA_VIDEO_CONFIG.canonicalProviderId,
              modelId: "pika/pika-2-2",
              executionId: op.executionId,
              organizationId: op.organizationId,
            }),
          noopToken
        ),
      ]);

      const listed = await artifactRepo.list("exec_race");
      const artifactId = artifacts.buildArtifactId(opId, 0);
      expect(listed.filter((a) => a.artifactId === artifactId).length).toBe(1);
    });
  });

  describe("large video stream ingestion", () => {
    it("uses putStream without loading entire payload in memory at once", async () => {
      class StreamingBlobStorage extends RecordingS3BlobStorage {
        maxConcurrentBuffer = 0;
        async putStream(
          key: string,
          stream: AsyncIterable<Uint8Array>,
          options?: { contentType?: string; maxBytes?: number }
        ): Promise<Result<{ key: string; size: number; checksum?: string }>> {
          let size = 0;
          for await (const chunk of stream) {
            size += chunk.byteLength;
            this.maxConcurrentBuffer = Math.max(this.maxConcurrentBuffer, chunk.byteLength);
          }
          const data = Buffer.alloc(size, 1);
          this.objects.set(key, { data, contentType: options?.contentType });
          return success({ key, size, checksum: "stream-checksum" });
        }
      }

      const blobStorage = new StreamingBlobStorage();
      const ownership = new BlobOwnershipRegistry();
      async function* largeStream(): AsyncIterable<Uint8Array> {
        for (let i = 0; i < 8; i++) {
          yield Buffer.alloc(64 * 1024, i);
        }
      }
      const downloadClient: FakeMediaDownloadClient & {
        downloadStream: NonNullable<FakeMediaDownloadClient["downloadStream"]>;
      } = Object.assign(new FakeMediaDownloadClient(), {
        downloadStream: async () =>
          success({ stream: largeStream(), mimeType: "video/mp4" }),
      });

      const ingestion = new MediaIngestionService(blobStorage, ownership, downloadClient);
      const result = await ingestion.ingest({
        organizationId: "org_a",
        executionId: "exec_stream",
        artifactId: "art_stream_0",
        outputIndex: 0,
        temporaryUrl: "https://cdn.example.test/large.mp4",
        mimeType: "video/mp4",
      });
      expect(result.ok).toBe(true);
      expect(blobStorage.maxConcurrentBuffer).toBeLessThanOrEqual(64 * 1024);
    });
  });

  describe("SSRF temp URL security", () => {
    it("rejects localhost provider result URLs", () => {
      const check = validateIngestionUrl("http://127.0.0.1/video.mp4");
      expect(check.ok).toBe(false);
    });
  });

  describe("secret safety", () => {
    it("does not embed API keys in operation-safe metadata", async () => {
      const { dispatcher } = createVideoLeaf(RUNWAY_VIDEO_CONFIG);
      const req = buildVideoRequest({
        providerId: RUNWAY_VIDEO_CONFIG.canonicalProviderId,
        modelId: "runway/runway-gen-4",
        payload: { prompt: "test", apiKey: "sk-secret-should-not-leak" },
      });
      const submit = await dispatcher.submitAsync(req, noopToken, "secret_test");
      expect(submit.ok).toBe(true);
      if (!submit.ok) return;
      const serialized = JSON.stringify(submit.value);
      expect(serialized).not.toContain("sk-secret");
      expect(serialized).not.toContain("RUNWAY_API_KEY");
    });
  });

  describe("capability enforcement", () => {
    it("rejects wrong capability before network", async () => {
      const { dispatcher } = createVideoLeaf(RUNWAY_VIDEO_CONFIG);
      const req = buildVideoRequest({
        providerId: RUNWAY_VIDEO_CONFIG.canonicalProviderId,
        modelId: "runway/runway-gen-4",
      });
      (req as { capabilityId: typeof req.capabilityId }).capabilityId = asCapabilityId("text.generate");
      const submit = await dispatcher.submitAsync(req, noopToken, "bad_cap");
      expect(submit.ok).toBe(false);
    });

    it("rejects unknown model before network", async () => {
      const { dispatcher } = createVideoLeaf(RUNWAY_VIDEO_CONFIG);
      const req = buildVideoRequest({
        providerId: RUNWAY_VIDEO_CONFIG.canonicalProviderId,
        modelId: "runway/unknown-model",
      });
      const submit = await dispatcher.submitAsync(req, noopToken, "bad_model");
      expect(submit.ok).toBe(false);
    });
  });
});

describe("M9.5E all catalog video providers registered", () => {
  it("discovers 8 inventory-backed video providers", () => {
    expect(ALL_VIDEO_PROVIDER_CONFIGS.length).toBe(8);
  });
});
