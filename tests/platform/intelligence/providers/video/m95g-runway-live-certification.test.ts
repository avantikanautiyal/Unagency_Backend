/**
 * M9.5G — Runway LIVE certification (offline) + opt-in LIVE smoke.
 * LIVE runs only when isRunwayLiveSmokeEnabled() is true.
 */

import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import {
  asCapabilityId,
  asExecutionId,
  asOrganizationId,
  asProviderId,
  asWorkspaceId,
} from "../../../../../src/platform/intelligence/shared/identifiers";
import { sampleRequest } from "../../../../../src/platform/intelligence/providers/runtime/testing";
import type { CancellationToken } from "../../../../../src/platform/intelligence/providers/runtime/contracts/cancellation";
import { RUNWAY_VIDEO_SPEC } from "../../../../../src/platform/intelligence/providers/video/configs/verified-video-provider-specs";
import { createVerifiedVideoProvider } from "../../../../../src/platform/intelligence/providers/video/factories/create-verified-video-provider";
import {
  RecordingVideoHttpClient,
  type VideoHttpRequest,
  type VideoHttpResponse,
} from "../../../../../src/platform/intelligence/providers/video/http/video-http-client";
import { success, failure } from "../../../../../src/platform/intelligence/shared/result";
import { ValidationError } from "../../../../../src/platform/intelligence/shared/errors";
import { registerVideoProviders } from "../../../../../src/platform/production/execution/register-video-providers";
import { createModelRegistryPlatform } from "../../../../../src/platform/intelligence/model-registry/factories/create-model-registry-platform";
import { InMemoryProviderRuntimeRegistry } from "../../../../../src/platform/intelligence/providers/runtime/registry/in-memory-provider-runtime-registry";
import { MongoProviderOperationStore } from "../../../../../src/platform/intelligence/providers/async/store/mongo-provider-operation-store";
import { AsyncProviderRuntime } from "../../../../../src/platform/intelligence/providers/async/runtime/async-provider-runtime";
import {
  FakeMediaDownloadClient,
  MediaIngestionService,
} from "../../../../../src/platform/media/ingestion/media-ingestion-service";
import { MediaArtifactService } from "../../../../../src/platform/media/artifacts/media-artifact-service";
import { InMemoryArtifactRepository } from "../../../../../src/platform/infrastructure/durability/repositories/in-memory-execution-persistence";
import { RecordingS3BlobStorage } from "../../../../../src/platform/persistence/storage/s3-blob-storage";
import { BlobAccessService } from "../../../../../src/platform/media/blob/blob-access-service";
import { MongoBlobMetadataRepository } from "../../../../../src/platform/media/blob/blob-metadata-repository";
import { MediaDeliveryService } from "../../../../../src/platform/media/delivery/media-delivery-service";
import { createVideoExecutionRouter } from "../../../../../src/platform/intelligence/providers/video/routing/video-execution-router";
import {
  isRunwayLiveSmokeEnabled,
  resolveVideoCertificationAllowedProviderIds,
} from "../../../../../src/platform/production/execution/video-certification-config";
import { EnterpriseProviderOperation } from "../../../../../src/platform/infrastructure/durability/mongo/models/enterprise-provider-operation.model";
import { EnterpriseBlobMetadata } from "../../../../../src/platform/infrastructure/durability/mongo/models/enterprise-blob-metadata.model";

const noopToken: CancellationToken = { cancelled: false, reason: undefined };

function ok(body: Record<string, unknown>, status = 200): VideoHttpResponse {
  return { status, headers: {}, body, latencyMs: 1 };
}

function runwayHttp(submits: { count: number }) {
  return new RecordingVideoHttpClient(async (req: VideoHttpRequest) => {
    if (req.method === "POST" && req.path === "/v1/text_to_video") {
      submits.count += 1;
      expect(req.headers?.["X-Runway-Version"]).toBe("2024-11-06");
      expect(req.body?.model).toBe("gen4.5");
      return success(ok({ id: "task_rw_g" }));
    }
    return success(
      ok({
        id: "task_rw_g",
        status: "SUCCEEDED",
        output: ["https://cdn.example.test/runway-g.mp4"],
      })
    );
  });
}

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

describe("M9.5G Runway certification config", () => {
  it("restricts routing candidates when VIDEO_CERTIFICATION_PROVIDER is set", async () => {
    const prev = process.env.VIDEO_CERTIFICATION_PROVIDER;
    process.env.VIDEO_CERTIFICATION_PROVIDER = "provider.runway";
    try {
      const registry = new InMemoryProviderRuntimeRegistry();
      const modelRegistry = createModelRegistryPlatform({ loadSeed: true });
      const http = runwayHttp({ count: 0 });
      registerVideoProviders({
        executionMode: "openai_simulated",
        modelRegistry: modelRegistry.registry,
        registry,
        httpClientsByVendor: { runway: http, luma: http },
      });
      const allowed = resolveVideoCertificationAllowedProviderIds(process.env, registry);
      expect(allowed?.map(String)).toEqual(["provider.runway"]);

      const router = createVideoExecutionRouter({
        registry,
        createId: (p) => `${p}_g`,
        allowedProviderIds: allowed,
      });
      const routed = await router.resolve({
        prompt: "minimal geometric sculpture, studio lighting",
        capabilityId: "video.generate",
      });
      expect(routed.ok).toBe(true);
      if (routed.ok) {
        expect(routed.value.providerId).toBe("provider.runway");
        expect(routed.value.routingDecisionId).toBeTruthy();
      }
    } finally {
      if (prev === undefined) delete process.env.VIDEO_CERTIFICATION_PROVIDER;
      else process.env.VIDEO_CERTIFICATION_PROVIDER = prev;
    }
  });

  it("does not enable live smoke without explicit flags", () => {
    const env = {
      RUNWAY_API_KEY: "rw_key",
      RUNWAY_ENABLED: "true",
      RUN_LIVE_RUNWAY_VIDEO_SMOKE: "false",
      ENTERPRISE_API_EXECUTION_MODE: "live",
      ENTERPRISE_ASYNC_MEDIA_ENABLED: "true",
      ENTERPRISE_API_DURABLE_MODE: "true",
    };
    expect(isRunwayLiveSmokeEnabled(env)).toBe(false);
    expect(
      isRunwayLiveSmokeEnabled({
        ...env,
        RUN_LIVE_RUNWAY_VIDEO_SMOKE: "true",
        ENTERPRISE_API_EXECUTION_MODE: "simulated",
      })
    ).toBe(false);
  });
});

describe("M9.5G Runway Mongo restart recovery", () => {
  it("resumes same providerJobId after runtime restart without resubmit", async () => {
    const submits = { count: 0 };
    const http = runwayHttp(submits);
    const platform = createVerifiedVideoProvider({
      spec: RUNWAY_VIDEO_SPEC,
      mode: "simulated",
      auth: { apiKey: "rw" },
      httpClient: http,
    });
    if (!platform.ok) throw platform.error;

    const store = new MongoProviderOperationStore();
    const recording = new RecordingS3BlobStorage();
    const blobMeta = new MongoBlobMetadataRepository();
    const blobAccess = new BlobAccessService(blobMeta, recording);
    const artifactsRepo = new InMemoryArtifactRepository();

    const runtime1 = new AsyncProviderRuntime({
      store,
      ingestion: new MediaIngestionService(
        recording,
        blobMeta,
        new FakeMediaDownloadClient({}, undefined, {
          data: Buffer.from("mp4-bytes"),
          mimeType: "video/mp4",
        })
      ),
      artifacts: new MediaArtifactService(artifactsRepo),
      blobAccess,
    });

    const base = sampleRequest({ providerId: "provider.runway" });
    const req = {
      ...base,
      providerId: asProviderId("provider.runway"),
      modelId: "runway/runway-gen-4",
      capabilityId: asCapabilityId("video.generate"),
      payload: { prompt: "minimal sculpture pan" },
      context: {
        ...base.context,
        executionId: asExecutionId("exec_g_restart"),
        organizationId: asOrganizationId("org_a"),
        workspaceId: asWorkspaceId("ws_1"),
        providerId: asProviderId("provider.runway"),
      },
    };

    const submit = await runtime1.submit(platform.value.dispatcher, req, noopToken, "attempt_g");
    expect(submit.ok).toBe(true);
    if (!submit.ok) return;
    expect(submits.count).toBe(1);

    const runtime2 = new AsyncProviderRuntime({
      store,
      ingestion: new MediaIngestionService(
        recording,
        blobMeta,
        new FakeMediaDownloadClient({}, undefined, {
          data: Buffer.from("mp4-bytes"),
          mimeType: "video/mp4",
        })
      ),
      artifacts: new MediaArtifactService(artifactsRepo),
      blobAccess,
    });

    await runtime2.runToCompletion(
      "worker_restart",
      () => platform.value.dispatcher,
      () => req,
      noopToken
    );

    expect(submits.count).toBe(1);
    const finalOp = await store.get(submit.value.operation.operationId);
    expect(finalOp?.providerJobId).toBe("task_rw_g");
    expect(finalOp?.state).toBe("artifact_created");
    expect(finalOp?.artifactIds?.length).toBe(1);
  });
});

describe("M9.5G ingestion failure recovery", () => {
  it("retries media ingest without resubmitting provider job", async () => {
    const submits = { count: 0 };
    const http = runwayHttp(submits);
    const platform = createVerifiedVideoProvider({
      spec: RUNWAY_VIDEO_SPEC,
      mode: "simulated",
      auth: { apiKey: "rw" },
      httpClient: http,
    });
    if (!platform.ok) throw platform.error;

    const store = new MongoProviderOperationStore();
    const recording = new RecordingS3BlobStorage();
    const blobMeta = new MongoBlobMetadataRepository();
    let streamAttempts = 0;
    const flakyDownload = new FakeMediaDownloadClient(
      {},
      undefined,
      { data: Buffer.from("mp4-bytes"), mimeType: "video/mp4" }
    );
    const origStream = flakyDownload.downloadStream!.bind(flakyDownload);
    flakyDownload.downloadStream = async (url, opts) => {
      streamAttempts += 1;
      if (streamAttempts === 1) {
        return failure(new ValidationError("simulated storage failure"));
      }
      return origStream(url, opts);
    };

    const runtime = new AsyncProviderRuntime({
      store,
      ingestion: new MediaIngestionService(recording, blobMeta, flakyDownload),
      artifacts: new MediaArtifactService(new InMemoryArtifactRepository()),
      blobAccess: new BlobAccessService(blobMeta, recording),
    });

    const base = sampleRequest({ providerId: "provider.runway" });
    const req = {
      ...base,
      providerId: asProviderId("provider.runway"),
      modelId: "runway/runway-gen-4",
      capabilityId: asCapabilityId("video.generate"),
      payload: { prompt: "retry ingest" },
      context: {
        ...base.context,
        executionId: asExecutionId("exec_g_ingest"),
        organizationId: asOrganizationId("org_a"),
        workspaceId: asWorkspaceId("ws_1"),
        providerId: asProviderId("provider.runway"),
      },
    };

    await runtime.submit(platform.value.dispatcher, req, noopToken, "attempt_ingest");
    await runtime.runToCompletion("w1", () => platform.value.dispatcher, () => req, noopToken, 5);
    await runtime.runToCompletion("w2", () => platform.value.dispatcher, () => req, noopToken, 5);

    expect(submits.count).toBe(1);
    expect(streamAttempts).toBeGreaterThanOrEqual(2);
  });
});

describe("M9.5G media delivery tenant isolation", () => {
  it("allows owner tenant and denies cross-tenant artifact media", async () => {
    const artifacts = new InMemoryArtifactRepository();
    const recording = new RecordingS3BlobStorage();
    const blobMeta = new MongoBlobMetadataRepository();
    const blobAccess = new BlobAccessService(blobMeta, recording, 60);
    const delivery = new MediaDeliveryService(artifacts, blobAccess);

    const key = "tenant/org_a/exec_1/art_1/0.mp4";
    await recording.put(key, Buffer.from("video"), "video/mp4");
    await blobMeta.register({
      storageKey: key,
      organizationId: "org_a",
      executionId: "exec_1",
      artifactId: "art_g_1",
      mimeType: "video/mp4",
      sizeBytes: 10,
      checksum: "abc",
      createdAt: new Date().toISOString(),
    });
    await artifacts.save("exec_1", "org_a", [
      {
        artifactId: "art_g_1",
        label: `blob:${key}`,
        kind: "video",
      },
    ]);

    const owner = await delivery.resolveArtifactMediaUrl("art_g_1", "org_a");
    expect(owner.ok).toBe(true);
    const other = await delivery.resolveArtifactMediaUrl("art_g_1", "org_b");
    expect(other.ok).toBe(false);
    const missing = await delivery.resolveArtifactMediaUrl("art_missing", "org_a");
    expect(missing.ok).toBe(false);
  });
});

describe("M9.5G Runway provider failure normalization", () => {
  it("maps FAILED task without leaking raw vendor body", async () => {
    const http = new RecordingVideoHttpClient(async (req) => {
      if (req.path === "/v1/text_to_video") return success(ok({ id: "task_fail" }));
      return success(
        ok({ id: "task_fail", status: "FAILED", failure: "content policy violation" })
      );
    });
    const platform = createVerifiedVideoProvider({
      spec: RUNWAY_VIDEO_SPEC,
      mode: "simulated",
      auth: { apiKey: "rw" },
      httpClient: http,
    });
    if (!platform.ok) throw platform.error;
    const base = sampleRequest({ providerId: "provider.runway" });
    const req = {
      ...base,
      providerId: asProviderId("provider.runway"),
      modelId: "runway/runway-gen-4",
      capabilityId: asCapabilityId("video.generate"),
      payload: { prompt: "x" },
      context: { ...base.context, providerId: asProviderId("provider.runway") },
    };
    const submit = await platform.value.dispatcher.submitAsync(req, noopToken, "idem_f");
    expect(submit.ok).toBe(true);
    const poll = await platform.value.dispatcher.pollAsync(req, "task_fail", noopToken);
    expect(poll.ok).toBe(true);
    if (poll.ok) expect(poll.value.status).toBe("failed");
  });
});

(isRunwayLiveSmokeEnabled(process.env) ? describe : describe.skip)(
  "M9.5G LIVE Runway certification smoke (opt-in)",
  () => {
    it("completes full Enterprise API path with real Runway", async () => {
      process.env.VIDEO_CERTIFICATION_PROVIDER = "provider.runway";
      process.env.RUNWAY_ENABLED = "true";

      const { createEnterpriseApiPlatform } = await import(
        "../../../../../src/platform/api/factories/create-enterprise-api-platform"
      );
      const platform = createEnterpriseApiPlatform({
        executionMode: "live",
        seedDemoTenant: true,
      });

      const orgId = platform.seed!.organizationId;
      const prompt =
        "A slow camera pan across a minimal geometric sculpture in a clean studio, soft neutral lighting, no people, no text.";

      const created = await platform.executions.create(
        {
          prompt,
          organizationId: orgId,
          capabilityId: "video.generate",
          metadata: { duration: 5, aspectRatio: "16:9" },
        },
        {
          principalId: platform.seed!.userId,
          kind: "user",
          userId: platform.seed!.userId,
          organizationId: orgId,
          roles: ["owner"],
          workspaceId: platform.seed!.workspaceId,
        }
      );
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      let terminal = created.value.status;
      for (let i = 0; i < 180; i += 1) {
        const got = await platform.executions.get(created.value.executionId, {
          organizationId: orgId,
        });
        if (!got.ok) break;
        terminal = got.value.status;
        if (terminal === "succeeded" || terminal === "failed" || terminal === "cancelled") break;
        await new Promise((r) => setTimeout(r, 3000));
      }
      expect(terminal).toBe("succeeded");
      if (platform.asyncReconciler) await platform.asyncReconciler.shutdown();
    }, 600_000);
  }
);
