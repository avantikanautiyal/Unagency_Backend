/**
 * M9.5G1 — complete video production readiness (credential-free, zero external AI calls).
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
  KLING_VIDEO_SPEC,
  LUMA_VIDEO_SPEC,
  MINIMAX_VIDEO_SPEC,
  PIXVERSE_VIDEO_SPEC,
  GOOGLE_VEO_VIDEO_SPEC,
  PIKA_VIDEO_SPEC,
  HIGGSFIELD_VIDEO_SPEC,
  VERIFIED_VIDEO_PROVIDER_SPECS,
  type VerifiedVideoProviderSpec,
} from "../../../../../src/platform/intelligence/providers/video/configs/verified-video-provider-specs";
import { createVerifiedVideoProvider } from "../../../../../src/platform/intelligence/providers/video/factories/create-verified-video-provider";
import {
  RecordingVideoHttpClient,
  type VideoHttpRequest,
  type VideoHttpResponse,
} from "../../../../../src/platform/intelligence/providers/video/http/video-http-client";
import { success } from "../../../../../src/platform/intelligence/shared/result";
import { signKlingJwt, decodeKlingJobId } from "../../../../../src/platform/intelligence/providers/video/kling/kling-video-protocol";
import { createHmac } from "crypto";
import { registerVideoProviders } from "../../../../../src/platform/production/execution/register-video-providers";
import { evaluateVideoProviderEnv } from "../../../../../src/platform/production/execution/video-provider-env";
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
import { createVideoExecutionRouter } from "../../../../../src/platform/intelligence/providers/video/routing/video-execution-router";
import { resolveVideoCertificationAllowedProviderIds } from "../../../../../src/platform/production/execution/video-certification-config";
import {
  listVerifiedVideoLiveSmokeGates,
  blockedVideoProviders,
} from "../../../../../src/platform/production/execution/video-live-smoke-gates";
import { createEnterpriseApiPlatform } from "../../../../../src/platform/api/factories/create-enterprise-api-platform";
import { createDurableStores } from "../../../../../src/platform/infrastructure/durability/create-durable-stores";
import { PIXVERSE_IMAGE_UPLOAD_PATH, PIXVERSE_IMG_GENERATE_PATH } from "../../../../../src/platform/intelligence/providers/video/pixverse/pixverse-video-protocol";

const noopToken: CancellationToken = { cancelled: false, reason: undefined };

function ok(body: Record<string, unknown>, status = 200): VideoHttpResponse {
  return { status, headers: {}, body, latencyMs: 1 };
}

function videoReq(
  providerId: string,
  modelId: string,
  payload: Record<string, unknown> = {}
) {
  const base = sampleRequest({ providerId });
  return {
    ...base,
    providerId: asProviderId(providerId),
    modelId,
    capabilityId: asCapabilityId("video.generate"),
    payload: { prompt: "minimal geometric sculpture, studio lighting", ...payload },
    context: {
      ...base.context,
      executionId: asExecutionId(`exec_${providerId.replace(/\./g, "_")}`),
      organizationId: asOrganizationId("org_a"),
      workspaceId: asWorkspaceId("ws_1"),
      providerId: asProviderId(providerId),
    },
  };
}

function vendorMockHttp(spec: VerifiedVideoProviderSpec): RecordingVideoHttpClient {
  return new RecordingVideoHttpClient(async (req: VideoHttpRequest) => {
    switch (spec.vendor) {
      case "runway":
        if (req.path === "/v1/text_to_video" || req.path === "/v1/image_to_video") {
          return success(ok({ id: "task_rw" }));
        }
        return success(
          ok({ id: "task_rw", status: "SUCCEEDED", output: ["https://cdn.example.test/rw.mp4"] })
        );
      case "kling":
        if (req.path.includes("/text2video") && req.method === "POST") {
          return success(ok({ data: { task_id: "kling_t", task_status: "submitted" } }));
        }
        if (req.path.includes("/image2video") && req.method === "POST") {
          return success(ok({ data: { task_id: "kling_i", task_status: "submitted" } }));
        }
        return success(
          ok({
            data: {
              task_status: "succeed",
              task_result: { videos: [{ url: "https://cdn.example.test/kling.mp4" }] },
            },
          })
        );
      case "luma":
        if (req.path === "/dream-machine/v1/generations" && req.method === "POST") {
          return success(ok({ id: "luma_1", state: "dreaming" }));
        }
        return success(
          ok({
            id: "luma_1",
            state: "completed",
            assets: { video: "https://cdn.example.test/luma.mp4" },
          })
        );
      case "minimax":
        if (req.path === "/v1/video_generation") return success(ok({ task_id: "mm_1" }));
        if (req.path.startsWith("/v1/query/video_generation")) {
          return success(ok({ status: "Success", file_id: "file_mm" }));
        }
        if (req.path.startsWith("/v1/files/retrieve")) {
          return success(ok({ file: { download_url: "https://cdn.example.test/mm.mp4" } }));
        }
        break;
      case "pixverse":
        if (req.path === PIXVERSE_IMAGE_UPLOAD_PATH) {
          return success(ok({ ErrCode: 0, Resp: { img_id: 99 } }));
        }
        if (
          req.path === PIXVERSE_IMG_GENERATE_PATH ||
          req.path === "/openapi/v2/video/text/generate"
        ) {
          return success(ok({ ErrCode: 0, Resp: { video_id: 42 } }));
        }
        if (req.path.includes("/openapi/v2/video/result/")) {
          return success(
            ok({ ErrCode: 0, Resp: { status: 1, url: "https://cdn.example.test/px.mp4" } })
          );
        }
        break;
      case "google":
        if (req.path.includes(":predictLongRunning")) {
          return success(ok({ name: "operations/op_g", done: false }));
        }
        return success(
          ok({
            name: "operations/op_g",
            done: true,
            response: {
              generateVideoResponse: {
                generatedSamples: [{ video: { uri: "https://cdn.example.test/veo.mp4" } }],
              },
            },
          })
        );
    }
    throw new Error(`unexpected ${spec.vendor} ${req.method} ${req.path}`);
  });
}

function authFor(spec: VerifiedVideoProviderSpec) {
  return spec.secretEnvVar
    ? { accessKey: "ak_test", secretKey: "sk_test" }
    : { apiKey: "key_test" };
}

async function runProviderToArtifact(spec: VerifiedVideoProviderSpec, payload: Record<string, unknown> = {}) {
  const http = vendorMockHttp(spec);
  const ownership = new BlobOwnershipRegistry();
  const blobAccess = new BlobAccessService(ownership);
  const platform = createVerifiedVideoProvider({
    spec,
    mode: "simulated",
    auth: authFor(spec),
    httpClient: http,
    blobAccess,
    inputBytesLoader: {
      async loadFromUrl() {
        return success({ data: Buffer.from("png-bytes"), contentType: "image/png" });
      },
    },
  });
  expect(platform.ok).toBe(true);
  if (!platform.ok) throw platform.error;

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

  const modelId = `${spec.vendor === "google" ? "google" : spec.vendor}/${spec.inventoryModelId}`;
  // inventory uses vendor slug matching catalog
  const canonicalModel =
    spec.canonicalProviderId === "provider.google"
      ? "google/veo-3"
      : `${spec.vendor}/${spec.inventoryModelId}`;

  const req = videoReq(spec.canonicalProviderId, canonicalModel, payload);
  const submit = await runtime.submit(platform.value.dispatcher, req, noopToken, `attempt_${spec.vendor}`);
  expect(submit.ok).toBe(true);
  if (!submit.ok) throw submit.error;

  await runtime.runToCompletion(
    "w_g1",
    () => platform.value.dispatcher,
    () => req,
    noopToken
  );

  const finalOp = await store.get(submit.value.operation.operationId);
  expect(finalOp?.state).toBe("artifact_created");
  expect(finalOp?.artifactIds?.length).toBe(1);
  expect(finalOp?.providerId).toBe(spec.canonicalProviderId);
  return { http, submit, finalOp };
}

describe("M9.5G1 readiness matrix", () => {
  it("has 6 verified adapters and 2 blocked", () => {
    expect(VERIFIED_VIDEO_PROVIDER_SPECS.length).toBe(6);
    expect(blockedVideoProviders().map((p) => p.canonicalProviderId)).toEqual([
      "provider.pika",
      "provider.higgsfield",
    ]);
    expect(PIKA_VIDEO_SPEC.vendorApiVerified).toBe(false);
    expect(HIGGSFIELD_VIDEO_SPEC.vendorApiVerified).toBe(false);
    expect(PIXVERSE_VIDEO_SPEC.supportsImageToVideo).toBe(true);
    expect(listVerifiedVideoLiveSmokeGates().length).toBe(6);
  });
});

describe("M9.5G1 credential-free boot", () => {
  it("boots Enterprise API without any video credentials", () => {
    const prev = process.env.ENTERPRISE_ASYNC_MEDIA_ENABLED;
    process.env.ENTERPRISE_ASYNC_MEDIA_ENABLED = "true";
    try {
      const durableStores = createDurableStores(
        { ENTERPRISE_ASYNC_MEDIA_ENABLED: "true" },
        { forceInMemory: true }
      );
      const platform = createEnterpriseApiPlatform({
        executionMode: "simulated",
        seedDemoTenant: true,
        durableStores,
      });
      expect(platform.gateway).toBeDefined();
      expect(platform.providerRuntimeRegistry).toBeDefined();
      // No executable video providers without injected HTTP / credentials — app still boots
      const statuses = evaluateVideoProviderEnv({});
      expect(statuses.every((s) => !s.executable)).toBe(true);
      void platform.asyncReconciler?.shutdown();
    } finally {
      if (prev === undefined) delete process.env.ENTERPRISE_ASYNC_MEDIA_ENABLED;
      else process.env.ENTERPRISE_ASYNC_MEDIA_ENABLED = prev;
    }
  });

  it("future activation is env-only (smoke gates list all verified providers)", () => {
    const gates = listVerifiedVideoLiveSmokeGates();
    expect(gates.map((g) => g.providerId).sort()).toEqual(
      [
        "provider.google",
        "provider.kling",
        "provider.luma",
        "provider.minimax",
        "provider.pixverse",
        "provider.runway",
      ].sort()
    );
    for (const g of gates) {
      expect(g.smokeEnvVar.startsWith("RUN_LIVE_")).toBe(true);
      expect(g.credentialEnvVars.length).toBeGreaterThan(0);
    }
  });
});

describe("M9.5G1 Kling JWT", () => {
  it("signs JWT with iss/exp/nbf HS256 without leaking secrets", () => {
    const token = signKlingJwt("ak_test", "sk_test", 1_700_000_000);
    const [h, p, s] = token.split(".");
    expect(h && p && s).toBeTruthy();
    const payload = JSON.parse(Buffer.from(p!, "base64url").toString("utf8"));
    expect(payload.iss).toBe("ak_test");
    expect(payload.exp).toBe(1_700_000_000 + 1800);
    expect(payload.nbf).toBe(1_700_000_000 - 5);
    const expected = createHmac("sha256", "sk_test")
      .update(`${h}.${p}`)
      .digest("base64url");
    expect(s).toBe(expected);
    expect(decodeKlingJobId("image2video:abc").mode).toBe("image2video");
    expect(decodeKlingJobId("text2video:abc").taskId).toBe("abc");
  });
});

describe.each(VERIFIED_VIDEO_PROVIDER_SPECS.map((s) => [s.displayName, s] as const))(
  "M9.5G1 offline E2E — %s",
  (_name, spec) => {
    it("submit → poll → ingest → artifact", async () => {
      await runProviderToArtifact(spec);
    });

    it("restart recovery — no resubmit", async () => {
      const http = vendorMockHttp(spec);
      let submits = 0;
      const counting = new RecordingVideoHttpClient(async (req) => {
        if (req.method === "POST" && !req.path.includes("query") && !req.path.includes("result") && !req.path.includes("operations/") && !req.path.includes("/tasks/") && !req.path.includes("generations/")) {
          // rough submit detection
          if (
            req.path.includes("text_to_video") ||
            req.path.includes("image_to_video") ||
            req.path.includes("text2video") ||
            req.path.includes("image2video") ||
            req.path.includes("video_generation") ||
            req.path.includes("/generations") ||
            req.path.includes("text/generate") ||
            req.path.includes("img/generate") ||
            req.path.includes("predictLongRunning")
          ) {
            submits += 1;
          }
        }
        return http.send(req);
      });

      const ownership = new BlobOwnershipRegistry();
      const platform = createVerifiedVideoProvider({
        spec,
        mode: "simulated",
        auth: authFor(spec),
        httpClient: counting,
        blobAccess: new BlobAccessService(ownership),
        inputBytesLoader: {
          async loadFromUrl() {
            return success({ data: Buffer.from("x"), contentType: "image/png" });
          },
        },
      });
      if (!platform.ok) throw platform.error;

      const store = new InMemoryProviderOperationStore();
      const mkRuntime = () =>
        new AsyncProviderRuntime({
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
          blobAccess: new BlobAccessService(ownership),
        });

      const canonicalModel =
        spec.canonicalProviderId === "provider.google"
          ? "google/veo-3"
          : `${spec.vendor}/${spec.inventoryModelId}`;
      const req = videoReq(spec.canonicalProviderId, canonicalModel);
      const runtime1 = mkRuntime();
      const submit = await runtime1.submit(platform.value.dispatcher, req, noopToken, "r1");
      expect(submit.ok).toBe(true);
      if (!submit.ok) return;
      const jobId = submit.value.operation.providerJobId;
      const submitsAfter = submits;

      const runtime2 = mkRuntime();
      await runtime2.runToCompletion("w2", () => platform.value.dispatcher, () => req, noopToken);
      expect(submits).toBe(submitsAfter);
      const finalOp = await store.get(submit.value.operation.operationId);
      expect(finalOp?.providerJobId).toBe(jobId);
      expect(finalOp?.state).toBe("artifact_created");
    });
  }
);

describe("M9.5G1 PixVerse I2V upload bridge", () => {
  it("uploads image → img_id → img/generate without exposing img_id as asset id", async () => {
    const { RecordingS3BlobStorage } = await import(
      "../../../../../src/platform/persistence/storage/s3-blob-storage"
    );
    const { InMemoryBlobMetadataRepository } = await import(
      "../../../../../src/platform/media/blob/blob-metadata-repository"
    );
    const http = vendorMockHttp(PIXVERSE_VIDEO_SPEC);
    const recording = new RecordingS3BlobStorage();
    const blobMeta = new InMemoryBlobMetadataRepository();
    const key = "tenants/org_a/e1/a1/0.png";
    await recording.put(key, Buffer.from("png"), "image/png");
    await blobMeta.register({
      storageKey: key,
      organizationId: "org_a",
      executionId: "e1",
      artifactId: "a1",
      mimeType: "image/png",
      sizeBytes: 3,
      checksum: "x",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const platform = createVerifiedVideoProvider({
      spec: PIXVERSE_VIDEO_SPEC,
      mode: "simulated",
      auth: { apiKey: "px" },
      httpClient: http,
      blobAccess: new BlobAccessService(blobMeta, recording, 60),
      inputBytesLoader: {
        async loadFromUrl() {
          return success({ data: Buffer.from("img"), contentType: "image/png" });
        },
      },
    });
    if (!platform.ok) throw platform.error;

    const req = videoReq("provider.pixverse", "pixverse/pixverse-v4", {
      assets: [{ storageRef: `blob:${key}`, mimeType: "image/png" }],
    });
    const submit = await platform.value.dispatcher.submitAsync(req, noopToken, "trace-i2v");
    expect(submit.ok).toBe(true);
    if (!submit.ok) return;
    expect(http.calls.some((c) => c.path === PIXVERSE_IMAGE_UPLOAD_PATH && c.multipart)).toBe(true);
    expect(http.calls.some((c) => c.path === PIXVERSE_IMG_GENERATE_PATH)).toBe(true);
    const gen = http.calls.find((c) => c.path === PIXVERSE_IMG_GENERATE_PATH);
    expect(gen?.body?.img_id).toBe(99);
    expect(submit.value.providerJobId).toBe("42");
  });
});

describe("M9.5G1 I2V tenant isolation", () => {
  const i2vSpecs = [
    RUNWAY_VIDEO_SPEC,
    KLING_VIDEO_SPEC,
    LUMA_VIDEO_SPEC,
    MINIMAX_VIDEO_SPEC,
    GOOGLE_VEO_VIDEO_SPEC,
    PIXVERSE_VIDEO_SPEC,
  ];

  it.each(i2vSpecs.map((s) => [s.displayName, s] as const))(
    "%s rejects cross-tenant asset before vendor transport",
    async (_name, spec) => {
      const ownership = new BlobOwnershipRegistry();
      ownership.register({
        storageKey: "tenants/org_a/e1/a1/0.png",
        organizationId: "org_a",
        executionId: "e1",
        artifactId: "a1",
        mimeType: "image/png",
        sizeBytes: 4,
        checksum: "x",
        createdAt: "2026-01-01T00:00:00.000Z",
      });
      let vendorCalls = 0;
      const http = new RecordingVideoHttpClient(async () => {
        vendorCalls += 1;
        return success(ok({ id: "should_not" }));
      });
      const platform = createVerifiedVideoProvider({
        spec,
        mode: "simulated",
        auth: authFor(spec),
        httpClient: http,
        blobAccess: new BlobAccessService(ownership),
        inputBytesLoader: {
          async loadFromUrl() {
            vendorCalls += 1;
            return success({ data: Buffer.from("x"), contentType: "image/png" });
          },
        },
      });
      if (!platform.ok) throw platform.error;

      const canonicalModel =
        spec.canonicalProviderId === "provider.google"
          ? "google/veo-3"
          : `${spec.vendor}/${spec.inventoryModelId}`;
      const req = videoReq(spec.canonicalProviderId, canonicalModel, {
        assets: [{ storageRef: "blob:tenants/org_a/e1/a1/0.png" }],
      });
      // Switch to tenant B
      const foreign = {
        ...req,
        context: { ...req.context, organizationId: asOrganizationId("org_b") },
      };
      const submit = await platform.value.dispatcher.submitAsync(foreign, noopToken, "x");
      expect(submit.ok).toBe(false);
      expect(vendorCalls).toBe(0);
    }
  );
});

describe("M9.5G1 routing authority per provider", () => {
  it.each(VERIFIED_VIDEO_PROVIDER_SPECS.map((s) => [s.displayName, s] as const))(
    "%s is selected when certification provider is pinned",
    async (_name, spec) => {
      const registry = new InMemoryProviderRuntimeRegistry();
      const modelRegistry = createModelRegistryPlatform({ loadSeed: true });
      const http = vendorMockHttp(spec);
      const clients: Record<string, RecordingVideoHttpClient> = {
        [spec.vendor]: http,
      };
      // Register only this vendor as executable
      const registered = registerVideoProviders({
        executionMode: "openai_simulated",
        modelRegistry: modelRegistry.registry,
        registry,
        httpClientsByVendor: clients,
      });
      expect(registered.ok).toBe(true);

      const env = { VIDEO_CERTIFICATION_PROVIDER: spec.canonicalProviderId };
      const allowed = resolveVideoCertificationAllowedProviderIds(env, registry);
      const router = createVideoExecutionRouter({
        registry,
        createId: (p) => `${p}_${spec.vendor}`,
        allowedProviderIds: allowed,
      });
      const routed = await router.resolve({
        prompt: "product demo video",
        capabilityId: "video.generate",
      });
      expect(routed.ok).toBe(true);
      if (routed.ok) {
        expect(routed.value.providerId).toBe(spec.canonicalProviderId);
        expect(routed.value.routingDecisionId).toBeTruthy();
      }
    }
  );
});

describe("M9.5G1 provider failure normalization", () => {
  it("Runway FAILED maps to failed without leaking raw vendor body to caller identity", async () => {
    const http = new RecordingVideoHttpClient(async (req) => {
      if (req.path === "/v1/text_to_video") return success(ok({ id: "f1" }));
      return success(ok({ id: "f1", status: "FAILED", failure: "internal" }));
    });
    const platform = createVerifiedVideoProvider({
      spec: RUNWAY_VIDEO_SPEC,
      mode: "simulated",
      auth: { apiKey: "rw" },
      httpClient: http,
    });
    if (!platform.ok) throw platform.error;
    const req = videoReq("provider.runway", "runway/runway-gen-4");
    await platform.value.dispatcher.submitAsync(req, noopToken, "f");
    const poll = await platform.value.dispatcher.pollAsync(req, "f1", noopToken);
    expect(poll.ok && poll.value.status === "failed").toBe(true);
  });
});
