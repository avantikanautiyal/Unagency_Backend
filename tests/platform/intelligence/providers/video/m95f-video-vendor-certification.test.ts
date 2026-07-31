/**
 * M9.5F — verified vendor video contract certification + Enterprise API wiring.
 * Zero external network / AI provider calls.
 */

import {
  asCapabilityId,
  asExecutionId,
  asOrganizationId,
  asProviderId,
  asWorkspaceId,
} from "../../../../../src/platform/intelligence/shared/identifiers";
import { sampleRequest } from "../../../../../src/platform/intelligence/providers/runtime/testing";
import type { CancellationToken } from "../../../../../src/platform/intelligence/providers/runtime/contracts/cancellation";
import {
  RUNWAY_VIDEO_SPEC,
  LUMA_VIDEO_SPEC,
  MINIMAX_VIDEO_SPEC,
  PIXVERSE_VIDEO_SPEC,
  KLING_VIDEO_SPEC,
  GOOGLE_VEO_VIDEO_SPEC,
  PIKA_VIDEO_SPEC,
  HIGGSFIELD_VIDEO_SPEC,
  ALL_VIDEO_PROVIDER_SPECS,
  VERIFIED_VIDEO_PROVIDER_SPECS,
} from "../../../../../src/platform/intelligence/providers/video/configs/verified-video-provider-specs";
import { createVerifiedVideoProvider } from "../../../../../src/platform/intelligence/providers/video/factories/create-verified-video-provider";
import {
  RecordingVideoHttpClient,
  type VideoHttpRequest,
  type VideoHttpResponse,
} from "../../../../../src/platform/intelligence/providers/video/http/video-http-client";
import { success } from "../../../../../src/platform/intelligence/shared/result";
import { evaluateVideoProviderEnv } from "../../../../../src/platform/production/execution/video-provider-env";
import { registerVideoProviders } from "../../../../../src/platform/production/execution/register-video-providers";
import { createModelRegistryPlatform } from "../../../../../src/platform/intelligence/model-registry/factories/create-model-registry-platform";
import { InMemoryProviderRuntimeRegistry } from "../../../../../src/platform/intelligence/providers/runtime/registry/in-memory-provider-runtime-registry";
import { InMemoryProviderOperationStore } from "../../../../../src/platform/intelligence/providers/async/store/in-memory-provider-operation-store";
import { AsyncProviderRuntime } from "../../../../../src/platform/intelligence/providers/async/runtime/async-provider-runtime";
import { InMemoryBlobStorage } from "../../../../../src/platform/persistence/storage/in-memory-blob-storage";
import { BlobOwnershipRegistry } from "../../../../../src/platform/media/blob/blob-ownership-registry";
import { BlobAccessService } from "../../../../../src/platform/media/blob/blob-access-service";
import {
  FakeMediaDownloadClient,
  MediaIngestionService,
} from "../../../../../src/platform/media/ingestion/media-ingestion-service";
import { MediaArtifactService } from "../../../../../src/platform/media/artifacts/media-artifact-service";
import { InMemoryArtifactRepository } from "../../../../../src/platform/infrastructure/durability/repositories/in-memory-execution-persistence";
import { isAsyncExecutionRequest } from "../../../../../src/platform/intelligence/providers/async/coordination/async-execution-coordinator";

const noopToken: CancellationToken = { cancelled: false, reason: undefined };

function videoReq(providerId: string, modelId: string, payload: Record<string, unknown> = {}) {
  const base = sampleRequest({ providerId });
  return {
    ...base,
    providerId: asProviderId(providerId),
    modelId,
    capabilityId: asCapabilityId("video.generate"),
    payload: { prompt: "cinematic product shot", ...payload },
    context: {
      ...base.context,
      executionId: asExecutionId("exec_m95f"),
      organizationId: asOrganizationId("org_a"),
      workspaceId: asWorkspaceId("ws_1"),
      providerId: asProviderId(providerId),
    },
  };
}

function ok(body: Record<string, unknown>, status = 200): VideoHttpResponse {
  return { status, headers: {}, body, latencyMs: 1 };
}

describe("M9.5F vendor verification matrix", () => {
  it("investigates all 8 providers", () => {
    expect(ALL_VIDEO_PROVIDER_SPECS.length).toBe(8);
    expect(VERIFIED_VIDEO_PROVIDER_SPECS.length).toBe(6);
    expect(PIKA_VIDEO_SPEC.vendorApiVerified).toBe(false);
    expect(HIGGSFIELD_VIDEO_SPEC.vendorApiVerified).toBe(false);
  });

  it("does not allow env CONTRACT_VERIFIED to enable unverified adapters", () => {
    const statuses = evaluateVideoProviderEnv({
      PIKA_API_KEY: "pk_test",
      PIKA_ENABLED: "true",
      PIKA_VIDEO_CONTRACT_VERIFIED: "true",
      HIGGSFIELD_API_KEY: "hf_test",
      HIGGSFIELD_ENABLED: "true",
      HIGGSFIELD_VIDEO_CONTRACT_VERIFIED: "true",
    });
    expect(statuses.find((s) => s.providerId === "provider.pika")?.executable).toBe(false);
    expect(statuses.find((s) => s.providerId === "provider.higgsfield")?.executable).toBe(false);
  });

  it("marks verified providers executable when credentials present", () => {
    const statuses = evaluateVideoProviderEnv({
      RUNWAY_API_KEY: "rw_test",
      RUNWAY_ENABLED: "true",
      LUMA_API_KEY: "luma_test",
      LUMA_ENABLED: "true",
    });
    expect(statuses.find((s) => s.providerId === "provider.runway")?.executable).toBe(true);
    expect(statuses.find((s) => s.providerId === "provider.luma")?.executable).toBe(true);
  });
});

describe("M9.5F Runway contract", () => {
  it("maps text-to-video submit/poll with verified wire model gen4.5", async () => {
    const http = new RecordingVideoHttpClient(async (req: VideoHttpRequest) => {
      if (req.method === "POST" && req.path === "/v1/text_to_video") {
        expect(req.body?.model).toBe("gen4.5");
        expect(req.headers?.["X-Runway-Version"]).toBe("2024-11-06");
        return success(ok({ id: "task_rw_1" }, 200));
      }
      if (req.path.includes("/v1/tasks/")) {
        return success(
          ok({
            id: "task_rw_1",
            status: "SUCCEEDED",
            output: ["https://cdn.example.test/runway.mp4"],
          })
        );
      }
      throw new Error(`unexpected ${req.method} ${req.path}`);
    });

    const platform = createVerifiedVideoProvider({
      spec: RUNWAY_VIDEO_SPEC,
      mode: "simulated",
      auth: { apiKey: "rw_test" },
      httpClient: http,
    });
    expect(platform.ok).toBe(true);
    if (!platform.ok) return;

    const req = videoReq("provider.runway", "runway/runway-gen-4");
    const submit = await platform.value.dispatcher.submitAsync(req, noopToken, "idem_rw");
    expect(submit.ok).toBe(true);
    if (!submit.ok) return;
    expect(submit.value.providerJobId).toBe("task_rw_1");

    const poll = await platform.value.dispatcher.pollAsync(
      req,
      submit.value.providerJobId,
      noopToken
    );
    expect(poll.ok).toBe(true);
    if (!poll.ok) return;
    expect(poll.value.status).toBe("completed");
    expect(poll.value.outputs?.[0]?.temporaryUrl).toContain("cdn.example.test");
  });
});

describe("M9.5F Luma contract", () => {
  it("maps Dream Machine generations create/poll", async () => {
    const http = new RecordingVideoHttpClient(async (req) => {
      if (req.path === "/dream-machine/v1/generations" && req.method === "POST") {
        expect(req.body?.model).toBe("ray-2");
        return success(ok({ id: "gen_luma_1", state: "dreaming" }));
      }
      if (req.path.includes("/dream-machine/v1/generations/")) {
        return success(
          ok({
            id: "gen_luma_1",
            state: "completed",
            assets: { video: "https://cdn.example.test/luma.mp4" },
          })
        );
      }
      throw new Error(req.path);
    });
    const platform = createVerifiedVideoProvider({
      spec: LUMA_VIDEO_SPEC,
      mode: "simulated",
      auth: { apiKey: "luma" },
      httpClient: http,
    });
    if (!platform.ok) throw platform.error;
    const req = videoReq("provider.luma", "luma/luma-ray-2");
    const submit = await platform.value.dispatcher.submitAsync(req, noopToken, "idem_luma");
    expect(submit.ok).toBe(true);
    const poll = await platform.value.dispatcher.pollAsync(req, "gen_luma_1", noopToken);
    expect(poll.ok && poll.value.status === "completed").toBe(true);
  });
});

describe("M9.5F MiniMax / Kling / PixVerse / Google Veo contracts", () => {
  it("MiniMax submit + file retrieve completion", async () => {
    let phase = 0;
    const http = new RecordingVideoHttpClient(async (req) => {
      if (req.path === "/v1/video_generation") {
        expect(req.body?.model).toBe("MiniMax-Hailuo-2.3");
        return success(ok({ task_id: "mm_1" }));
      }
      if (req.path.startsWith("/v1/query/video_generation")) {
        phase += 1;
        if (phase === 1) return success(ok({ status: "Success", file_id: "file_1" }));
        return success(ok({ status: "Success", file_id: "file_1" }));
      }
      if (req.path.startsWith("/v1/files/retrieve")) {
        return success(ok({ file: { download_url: "https://cdn.example.test/mm.mp4" } }));
      }
      throw new Error(req.path);
    });
    const platform = createVerifiedVideoProvider({
      spec: MINIMAX_VIDEO_SPEC,
      mode: "simulated",
      auth: { apiKey: "mm" },
      httpClient: http,
    });
    if (!platform.ok) throw platform.error;
    const req = videoReq("provider.minimax", "minimax/hailuo-ai");
    const submit = await platform.value.dispatcher.submitAsync(req, noopToken, "idem_mm");
    expect(submit.ok).toBe(true);
    const poll = await platform.value.dispatcher.pollAsync(req, "mm_1", noopToken);
    expect(poll.ok && poll.value.status === "completed").toBe(true);
  });

  it("Kling JWT auth header + text2video", async () => {
    const http = new RecordingVideoHttpClient(async (req) => {
      expect(req.headers?.Authorization?.startsWith("Bearer ")).toBe(true);
      if (req.path === "/v1/videos/text2video") {
        expect(req.body?.model_name).toBe("kling-v2-1");
        return success(ok({ data: { task_id: "kling_1", task_status: "submitted" } }));
      }
      if (req.path.includes("/v1/videos/text2video/")) {
        return success(
          ok({
            data: {
              task_status: "succeed",
              task_result: { videos: [{ url: "https://cdn.example.test/kling.mp4" }] },
            },
          })
        );
      }
      throw new Error(req.path);
    });
    const platform = createVerifiedVideoProvider({
      spec: KLING_VIDEO_SPEC,
      mode: "simulated",
      auth: { accessKey: "ak", secretKey: "sk" },
      httpClient: http,
    });
    if (!platform.ok) throw platform.error;
    const req = videoReq("provider.kling", "kling/kling-2-1");
    const submit = await platform.value.dispatcher.submitAsync(req, noopToken, "idem_k");
    expect(submit.ok).toBe(true);
    if (!submit.ok) return;
    expect(submit.value.providerJobId).toBe("text2video:kling_1");
    const poll = await platform.value.dispatcher.pollAsync(
      req,
      submit.value.providerJobId,
      noopToken
    );
    expect(poll.ok && poll.value.status === "completed").toBe(true);
  });

  it("PixVerse text generate + result status 1", async () => {
    const http = new RecordingVideoHttpClient(async (req) => {
      expect(req.headers?.["API-KEY"]).toBe("px");
      if (req.path === "/openapi/v2/video/text/generate") {
        expect(req.body?.model).toBe("v4");
        expect(req.headers?.["Ai-trace-id"]).toBeTruthy();
        return success(ok({ ErrCode: 0, Resp: { video_id: 42 } }));
      }
      if (req.path.includes("/openapi/v2/video/result/")) {
        return success(
          ok({
            ErrCode: 0,
            Resp: { status: 1, url: "https://cdn.example.test/px.mp4", outputWidth: 1280, outputHeight: 720 },
          })
        );
      }
      throw new Error(req.path);
    });
    const platform = createVerifiedVideoProvider({
      spec: PIXVERSE_VIDEO_SPEC,
      mode: "simulated",
      auth: { apiKey: "px" },
      httpClient: http,
    });
    if (!platform.ok) throw platform.error;
    const req = videoReq("provider.pixverse", "pixverse/pixverse-v4");
    const submit = await platform.value.dispatcher.submitAsync(req, noopToken, "trace-uuid");
    expect(submit.ok).toBe(true);
    const poll = await platform.value.dispatcher.pollAsync(req, "42", noopToken);
    expect(poll.ok && poll.value.status === "completed").toBe(true);
  });

  it("Google Veo predictLongRunning + operations poll", async () => {
    const http = new RecordingVideoHttpClient(async (req) => {
      expect(req.headers?.["x-goog-api-key"]).toBe("gkey");
      if (req.path.includes(":predictLongRunning")) {
        expect(req.path).toContain("veo-3.1-generate-preview");
        return success(ok({ name: "operations/op123", done: false }));
      }
      if (req.path.includes("operations/")) {
        return success(
          ok({
            name: "operations/op123",
            done: true,
            response: {
              generateVideoResponse: {
                generatedSamples: [{ video: { uri: "https://cdn.example.test/veo.mp4" } }],
              },
            },
          })
        );
      }
      throw new Error(req.path);
    });
    const platform = createVerifiedVideoProvider({
      spec: GOOGLE_VEO_VIDEO_SPEC,
      mode: "simulated",
      auth: { apiKey: "gkey" },
      httpClient: http,
    });
    if (!platform.ok) throw platform.error;
    const req = videoReq("provider.google", "google/veo-3");
    const submit = await platform.value.dispatcher.submitAsync(req, noopToken, "idem_g");
    expect(submit.ok).toBe(true);
    const poll = await platform.value.dispatcher.pollAsync(req, "operations/op123", noopToken);
    expect(poll.ok && poll.value.status === "completed").toBe(true);
  });
});

describe("M9.5F registry + async pipeline with verified leaf", () => {
  it("registers verified providers and completes durable ingest", async () => {
    const http = new RecordingVideoHttpClient(async (req) => {
      if (req.path === "/v1/text_to_video") return success(ok({ id: "task_e2e" }));
      return success(
        ok({
          id: "task_e2e",
          status: "SUCCEEDED",
          output: ["https://cdn.example.test/e2e.mp4"],
        })
      );
    });

    const modelRegistry = createModelRegistryPlatform({ loadSeed: true });
    const registry = new InMemoryProviderRuntimeRegistry();
    const registered = registerVideoProviders({
      executionMode: "openai_simulated",
      modelRegistry: modelRegistry.registry,
      registry,
      httpClientsByVendor: { runway: http },
    });
    expect(registered.ok).toBe(true);
    if (!registered.ok) return;
    expect(registered.value.some((p) => String(p.providerId) === "provider.runway")).toBe(true);

    const ownership = new BlobOwnershipRegistry();
    const blobAccess = new BlobAccessService(ownership);
    const store = new InMemoryProviderOperationStore();
    const runtime = new AsyncProviderRuntime({
      store,
      ingestion: new MediaIngestionService(
        new InMemoryBlobStorage(),
        ownership,
        new FakeMediaDownloadClient({}, undefined, {
          data: Buffer.from("mp4"),
          mimeType: "video/mp4",
        })
      ),
      artifacts: new MediaArtifactService(new InMemoryArtifactRepository()),
      blobAccess,
    });

    const leaf = registry.resolveAvailable(asProviderId("provider.runway"))!.dispatcher as never;
    const req = videoReq("provider.runway", "runway/runway-gen-4");
    const submit = await runtime.submit(leaf, req, noopToken, "attempt_e2e");
    expect(submit.ok).toBe(true);
    if (!submit.ok) return;

    await runtime.runToCompletion(
      "w1",
      (op) => registry.resolveAvailable(asProviderId(op.providerId))?.dispatcher as never,
      (op) => videoReq(op.providerId, op.modelId, { prompt: "async" }),
      noopToken
    );

    const finalOp = await store.get(submit.value.operation.operationId);
    expect(finalOp?.state).toBe("artifact_created");
  });
});

describe("M9.5F production async gating", () => {
  it("uses capability for async path; ignores fake metadata in production", () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(
        isAsyncExecutionRequest({
          capabilityId: "video.generate",
          metadata: {},
          hasAsyncCoordinator: true,
        })
      ).toBe(true);
      expect(
        isAsyncExecutionRequest({
          capabilityId: "text.generate",
          metadata: { useFakeAsyncProvider: true },
          hasAsyncCoordinator: true,
        })
      ).toBe(false);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it("rejects creating unverified provider platform", () => {
    const platform = createVerifiedVideoProvider({
      spec: PIKA_VIDEO_SPEC,
      mode: "live",
      auth: { apiKey: "x" },
      httpClient: new RecordingVideoHttpClient(async () => success(ok({}))),
    });
    expect(platform.ok).toBe(false);
  });
});

describe("M9.5F VideoExecutionRouter", () => {
  it("routes only among executable video providers and rejects blocked prefs", async () => {
    const { createVideoExecutionRouter } = await import(
      "../../../../../src/platform/intelligence/providers/video/routing/video-execution-router"
    );
    const http = new RecordingVideoHttpClient(async (req) => {
      if (req.path === "/v1/text_to_video") return success(ok({ id: "t1" }));
      return success(ok({ id: "t1", status: "RUNNING" }));
    });
    const modelRegistry = createModelRegistryPlatform({ loadSeed: true });
    const registry = new InMemoryProviderRuntimeRegistry();
    const registered = registerVideoProviders({
      executionMode: "openai_simulated",
      modelRegistry: modelRegistry.registry,
      registry,
      httpClientsByVendor: { runway: http, luma: http },
    });
    expect(registered.ok).toBe(true);

    const router = createVideoExecutionRouter({
      registry,
      createId: (p) => `${p}_1`,
    });
    const routed = await router.resolve({ prompt: "product demo video" });
    expect(routed.ok).toBe(true);
    if (!routed.ok) return;
    expect(["provider.runway", "provider.luma"]).toContain(routed.value.providerId);
    expect(routed.value.routingDecisionId).toBeTruthy();

    const blocked = await router.resolve({
      prompt: "x",
      preferredProviderId: "provider.pika",
    });
    expect(blocked.ok).toBe(false);
  });
});

describe("M9.5F Enterprise API offline video E2E", () => {
  const prevAsync = process.env.ENTERPRISE_ASYNC_MEDIA_ENABLED;
  let platform: Awaited<
    ReturnType<
      typeof import("../../../../../src/platform/api/factories/create-enterprise-api-platform").createEnterpriseApiPlatform
    >
  > | undefined;

  afterEach(async () => {
    if (platform?.asyncReconciler) {
      await platform.asyncReconciler.shutdown();
    }
    platform = undefined;
    if (prevAsync === undefined) delete process.env.ENTERPRISE_ASYNC_MEDIA_ENABLED;
    else process.env.ENTERPRISE_ASYNC_MEDIA_ENABLED = prevAsync;
  });

  it("POST create video.generate → mocked vendor → artifact via production composition", async () => {
    process.env.ENTERPRISE_ASYNC_MEDIA_ENABLED = "true";
    const { createEnterpriseApiPlatform } = await import(
      "../../../../../src/platform/api/factories/create-enterprise-api-platform"
    );
    const { createDurableStores } = await import(
      "../../../../../src/platform/infrastructure/durability/create-durable-stores"
    );

    let submits = 0;
    const http = new RecordingVideoHttpClient(async (req) => {
      if (req.method === "POST" && req.path === "/v1/text_to_video") {
        submits += 1;
        return success(ok({ id: "task_ent_1" }));
      }
      if (req.path.includes("/v1/tasks/")) {
        return success(
          ok({
            id: "task_ent_1",
            status: "SUCCEEDED",
            output: ["https://cdn.example.test/ent.mp4"],
          })
        );
      }
      // Other vendors may be registered with same client — return safe pending
      if (req.method === "POST") {
        submits += 1;
        return success(ok({ id: "task_other", name: "operations/op1" }));
      }
      return success(ok({ id: "task_other", status: "RUNNING", done: false, state: "dreaming" }));
    });

    const durableStores = createDurableStores(
      { ENTERPRISE_ASYNC_MEDIA_ENABLED: "true" },
      { forceInMemory: true }
    );
    expect(durableStores.asyncMedia).toBeDefined();

    platform = createEnterpriseApiPlatform({
      executionMode: "simulated",
      seedDemoTenant: true,
      durableStores,
      videoHttpClientsByVendor: {
        runway: http,
        luma: http,
        minimax: http,
        pixverse: http,
        kling: http,
        google: http,
      },
    });

    const orgId = platform.seed!.organizationId;
    const principal = {
      principalId: platform.seed!.userId,
      kind: "user" as const,
      userId: platform.seed!.userId,
      organizationId: orgId,
      roles: ["owner"] as const,
      workspaceId: platform.seed!.workspaceId,
    };

    const created = await platform.executions.create(
      {
        prompt: "cinematic brand film",
        organizationId: orgId,
        capabilityId: "video.generate",
        providerId: "provider.runway",
        modelId: "runway/runway-gen-4",
      },
      principal
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.status).toBe("waiting_provider");
    expect(submits).toBeGreaterThanOrEqual(1);

    let terminal = false;
    for (let i = 0; i < 40; i += 1) {
      const got = await platform.executions.get(created.value.executionId, {
        organizationId: orgId,
        workspaceId: platform.seed!.workspaceId,
      });
      expect(got.ok).toBe(true);
      if (!got.ok) return;
      if (got.value.status === "succeeded" || got.value.status === "failed") {
        expect(got.value.status).toBe("succeeded");
        terminal = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(terminal).toBe(true);
  }, 20000);
});

describe("M9.5F tenant image-input isolation", () => {
  it("rejects cross-tenant image asset before vendor submit", async () => {
    const ownership = new BlobOwnershipRegistry();
    ownership.register({
      storageKey: "tenants/org_a/exec_1/art_1/0.mp4",
      organizationId: "org_a",
      executionId: "exec_1",
      artifactId: "art_1",
      mimeType: "image/png",
      sizeBytes: 12,
      checksum: "x",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const blobAccess = new BlobAccessService(ownership);
    let submits = 0;
    const http = new RecordingVideoHttpClient(async () => {
      submits += 1;
      return success(ok({ id: "should_not" }));
    });
    const platform = createVerifiedVideoProvider({
      spec: RUNWAY_VIDEO_SPEC,
      mode: "simulated",
      auth: { apiKey: "rw" },
      httpClient: http,
      blobAccess,
    });
    expect(platform.ok).toBe(true);
    if (!platform.ok) return;

    const base = sampleRequest({ providerId: "provider.runway" });
    const req = {
      ...base,
      providerId: asProviderId("provider.runway"),
      modelId: "runway/runway-gen-4",
      capabilityId: asCapabilityId("video.generate"),
      payload: {
        prompt: "animate",
        assets: [{ storageRef: "blob:tenants/org_a/exec_1/art_1/0.mp4", mimeType: "image/png" }],
      },
      context: {
        ...base.context,
        organizationId: asOrganizationId("org_b"),
        providerId: asProviderId("provider.runway"),
      },
    };
    const submit = await platform.value.dispatcher.submitAsync(req, noopToken, "idem_x");
    expect(submit.ok).toBe(false);
    expect(submits).toBe(0);
  });
});

describe("M9.5F restart recovery with verified adapter", () => {
  it("polls same providerJobId after store rebuild without resubmit", async () => {
    let submits = 0;
    const http = new RecordingVideoHttpClient(async (req) => {
      if (req.path === "/v1/text_to_video") {
        submits += 1;
        return success(ok({ id: "task_restart" }));
      }
      return success(
        ok({
          id: "task_restart",
          status: "SUCCEEDED",
          output: ["https://cdn.example.test/restart.mp4"],
        })
      );
    });

    const platform = createVerifiedVideoProvider({
      spec: RUNWAY_VIDEO_SPEC,
      mode: "simulated",
      auth: { apiKey: "rw" },
      httpClient: http,
    });
    if (!platform.ok) throw platform.error;

    const store1 = new InMemoryProviderOperationStore();
    const ownership = new BlobOwnershipRegistry();
    const runtime1 = new AsyncProviderRuntime({
      store: store1,
      ingestion: new MediaIngestionService(
        new InMemoryBlobStorage(),
        ownership,
        new FakeMediaDownloadClient({}, undefined, {
          data: Buffer.from("mp4"),
          mimeType: "video/mp4",
        })
      ),
      artifacts: new MediaArtifactService(new InMemoryArtifactRepository()),
      blobAccess: new BlobAccessService(ownership),
    });

    const req = videoReq("provider.runway", "runway/runway-gen-4");
    const submit = await runtime1.submit(platform.value.dispatcher, req, noopToken, "attempt_r");
    expect(submit.ok).toBe(true);
    if (!submit.ok) return;
    const jobId = submit.value.operation.providerJobId;
    expect(jobId).toBe("task_restart");
    expect(submits).toBe(1);

    // Simulate restart: new runtime, same in-memory snapshot via get/put of operation
    const op = await store1.get(submit.value.operation.operationId);
    expect(op).toBeDefined();
    const store2 = new InMemoryProviderOperationStore();
    await store2.create(op!);
    const runtime2 = new AsyncProviderRuntime({
      store: store2,
      ingestion: new MediaIngestionService(
        new InMemoryBlobStorage(),
        ownership,
        new FakeMediaDownloadClient({}, undefined, {
          data: Buffer.from("mp4"),
          mimeType: "video/mp4",
        })
      ),
      artifacts: new MediaArtifactService(new InMemoryArtifactRepository()),
      blobAccess: new BlobAccessService(ownership),
    });

    await runtime2.runToCompletion(
      "w2",
      () => platform.value.dispatcher,
      () => req,
      noopToken
    );
    expect(submits).toBe(1);
    const finalOp = await store2.get(submit.value.operation.operationId);
    expect(finalOp?.providerJobId).toBe("task_restart");
    expect(finalOp?.state).toBe("artifact_created");
  });
});
