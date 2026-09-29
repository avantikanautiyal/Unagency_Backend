/**
 * Generic Final/materialize VaultAssetResolver wiring (A–J).
 * No service-specific runtime branches.
 */

import {
  applyCdfTransition,
  createArtifact,
  createMemoryVaultAssetResolver,
  fixturePackaging3dDirection,
  fixturePackagingDieline,
  fixturePackagingFrontPack,
  fixturePackagingRoutes,
  fixtureSocialMediaOutput,
  fixtureSocialMediaPlatform,
  fixtureSocialMediaRoutes,
  fixtureSocialMediaSizeReference,
  getArtifactVersion,
  getDefaultVaultAssetResolver,
  markApproved,
  markValidated,
  PACKAGING_ARTIFACT_KEYS,
  PACKAGING_FIXTURE_IDS,
  renderArtifact,
  resetCdfArtifactEngineForTests,
  resetCdfRenderingForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  resolveAssetsForRender,
  setDefaultVaultAssetResolver,
  createMediaFileVaultAssetResolver,
  SOCIAL_MEDIA_ARTIFACT_KEYS,
  SOCIAL_MEDIA_FIXTURE_IDS,
} from "../../../src/platform/cdf";
import { success } from "../../../src/platform/core/result";
import type { IBlobStorage } from "../../../src/platform/persistence/interfaces";
import * as fs from "node:fs";
import * as path from "node:path";

const TINY_PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02,
  0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44,
  0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x03, 0x00,
  0x01, 0x00, 0x05, 0xfe, 0xd4, 0xef, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);

const EXEC_ID = "exec_9_1789250619974";
const VAULT_ID = SOCIAL_MEDIA_FIXTURE_IDS.vaultImage;

describe("CDF Vault materialize resolver (Final PNG)", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
    resetCdfRenderingForTests({
      registerFixtureRenderer: false,
      registerPresentationRenderers: true,
      registerPackagingRenderers: true,
      registerSocialMediaRenderers: true,
    });
  });

  function startSocialSession() {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "social-media",
      productMode: "ai",
      organizationId: "org_vault",
      projectId: "proj_vault",
    });
    if (!started.ok) throw new Error("start");
    const briefed = applyCdfTransition({
      sessionId: started.value.session.sessionId,
      action: "submit_brief",
      brief: "Instagram feed creative",
      expectedVersion: started.value.session.sessionVersion,
    });
    if (!briefed.ok) throw new Error("brief");
    return briefed.value.session;
  }

  function seedApprovedSocialOutput() {
    const session = startSocialSession();
    const routes = createArtifact({
      organizationId: "org_vault",
      projectId: "proj_vault",
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "routes",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      artifactType: "text_choice",
      data: fixtureSocialMediaRoutes() as never,
    });
    const platform = createArtifact({
      organizationId: "org_vault",
      projectId: "proj_vault",
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "platform",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.platform,
      artifactType: "config_choice",
      data: fixtureSocialMediaPlatform() as never,
    });
    const size = createArtifact({
      organizationId: "org_vault",
      projectId: "proj_vault",
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "size-reference",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
      artifactType: "config_choice",
      data: fixtureSocialMediaSizeReference() as never,
    });
    const data = fixtureSocialMediaOutput(routes.artifact.artifactId, 1);
    data.platformRef = {
      artifactId: platform.artifact.artifactId,
      version: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.platform,
    };
    data.sizeReferenceRef = {
      artifactId: size.artifact.artifactId,
      version: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.sizeReference,
    };
    data.canvas = {
      ...data.canvas,
      widthPx: 1,
      heightPx: 1,
    };
    const out = createArtifact({
      organizationId: "org_vault",
      projectId: "proj_vault",
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "output",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      artifactType: "image",
      data: data as never,
    });
    markValidated(out.artifact.artifactId, 1);
    markApproved(out.artifact.artifactId, 1);
    return { out, routes, vaultAssetId: VAULT_ID };
  }

  it("A — Final materialization with valid Vault asset succeeds", async () => {
    const { out, vaultAssetId } = seedApprovedSocialOutput();
    setDefaultVaultAssetResolver(
      createMemoryVaultAssetResolver({ [vaultAssetId]: TINY_PNG }),
    );

    const file = await renderArtifact({
      artifactId: out.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      format: "png",
      purpose: "final",
      organizationId: "org_vault",
      projectId: "proj_vault",
    });

    expect(file.artifactId).toBe(out.artifact.artifactId);
    expect(file.artifactVersion).toBe(1);
    expect(file.format).toBe("png");
    expect(file.byteLength).toBeGreaterThan(0);
  });

  it("B — Missing Vault asset fails with ASSET_NOT_FOUND", async () => {
    const { out } = seedApprovedSocialOutput();
    setDefaultVaultAssetResolver(createMemoryVaultAssetResolver({}));

    await expect(
      renderArtifact({
        artifactId: out.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        format: "png",
        purpose: "final",
        organizationId: "org_vault",
        projectId: "proj_vault",
      }),
    ).rejects.toMatchObject({ renderCode: "ASSET_NOT_FOUND" });
  });

  it("C — Missing resolver fails explicitly", async () => {
    expect(getDefaultVaultAssetResolver()).toBeUndefined();
    await expect(
      resolveAssetsForRender({
        vaultAssetIds: [VAULT_ID],
        requireAll: true,
      }),
    ).rejects.toThrow(/no VaultAssetResolver provided/i);
  });

  it("D — previewAssetRef resolves through authoritative Vault resolver", async () => {
    const { out, vaultAssetId } = seedApprovedSocialOutput();
    const seen: string[] = [];
    const file = await renderArtifact(
      {
        artifactId: out.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        format: "png",
        purpose: "final",
        organizationId: "org_vault",
        projectId: "proj_vault",
      },
      {
        vaultAssetResolver: {
          async resolve(input) {
            seen.push(input.vaultAssetId);
            return input.vaultAssetId === vaultAssetId ? TINY_PNG : undefined;
          },
        },
      },
    );
    expect(seen).toEqual([vaultAssetId]);
    expect(file.byteLength).toBe(TINY_PNG.byteLength);
  });

  it("E — Renderer rejects execution ID as vault identity at collect boundary", async () => {
    await expect(
      resolveAssetsForRender({
        vaultAssetIds: [EXEC_ID],
        resolver: createMemoryVaultAssetResolver({ [EXEC_ID]: TINY_PNG }),
        requireAll: true,
      }),
    ).rejects.toThrow(/Invalid vault asset id shape|ASSET_NOT_FOUND/i);
  });

  it("F/G — Renderer does not regenerate creative or create ArtifactVersion", async () => {
    const { out, vaultAssetId } = seedApprovedSocialOutput();
    const before = getArtifactVersion(out.artifact.artifactId, 1, {
      organizationId: "org_vault",
    });

    await renderArtifact(
      {
        artifactId: out.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        format: "png",
        purpose: "final",
        organizationId: "org_vault",
        projectId: "proj_vault",
      },
      {
        vaultAssetResolver: createMemoryVaultAssetResolver({
          [vaultAssetId]: TINY_PNG,
        }),
      },
    );

    const after = getArtifactVersion(out.artifact.artifactId, 1, {
      organizationId: "org_vault",
    });
    expect(after.version).toBe(before.version);
    expect(after.data).toEqual(before.data);
    expect(() =>
      getArtifactVersion(out.artifact.artifactId, 2, {
        organizationId: "org_vault",
      }),
    ).toThrow();
  });

  it("H — Packaging canonical image materializes via same resolver boundary", async () => {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "packaging",
      productMode: "ai",
      organizationId: "org_vault",
      projectId: "proj_vault",
    });
    if (!started.ok) throw new Error("start");
    const briefed = applyCdfTransition({
      sessionId: started.value.session.sessionId,
      action: "submit_brief",
      brief: "Pack",
      expectedVersion: started.value.session.sessionVersion,
    });
    if (!briefed.ok) throw new Error("brief");
    const session = briefed.value.session;

    const dieline = createArtifact({
      organizationId: "org_vault",
      projectId: "proj_vault",
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "dieline",
      artifactKey: PACKAGING_ARTIFACT_KEYS.dieline,
      artifactType: "config_choice",
      data: fixturePackagingDieline() as never,
    });
    const routes = createArtifact({
      organizationId: "org_vault",
      projectId: "proj_vault",
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "routes",
      artifactKey: PACKAGING_ARTIFACT_KEYS.routes,
      artifactType: "text_choice",
      data: fixturePackagingRoutes(dieline.artifact.artifactId, 1) as never,
    });
    const threeD = createArtifact({
      organizationId: "org_vault",
      projectId: "proj_vault",
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "3d-direction",
      artifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
      artifactType: "pack",
      data: fixturePackaging3dDirection({
        dielineArtifactId: dieline.artifact.artifactId,
        routesArtifactId: routes.artifact.artifactId,
      }) as never,
    });
    const front = createArtifact({
      organizationId: "org_vault",
      projectId: "proj_vault",
      sessionId: session.sessionId,
      serviceId: "packaging",
      phaseId: "front-pack",
      artifactKey: PACKAGING_ARTIFACT_KEYS.frontPack,
      artifactType: "pack",
      data: fixturePackagingFrontPack({
        dielineArtifactId: dieline.artifact.artifactId,
        routesArtifactId: routes.artifact.artifactId,
        threeDArtifactId: threeD.artifact.artifactId,
      }) as never,
    });
    markValidated(front.artifact.artifactId, 1);
    markApproved(front.artifact.artifactId, 1);

    const file = await renderArtifact(
      {
        artifactId: front.artifact.artifactId,
        artifactVersion: 1,
        artifactKey: PACKAGING_ARTIFACT_KEYS.frontPack,
        format: "png",
        purpose: "final",
        organizationId: "org_vault",
        projectId: "proj_vault",
      },
      {
        vaultAssetResolver: createMemoryVaultAssetResolver({
          [PACKAGING_FIXTURE_IDS.vaultImage]: TINY_PNG,
          [PACKAGING_FIXTURE_IDS.vaultDieline]: TINY_PNG,
        }),
      },
    );
    expect(file.artifactKey).toBe(PACKAGING_ARTIFACT_KEYS.frontPack);
    expect(file.byteLength).toBeGreaterThan(0);
  });

  it("I — MediaFile resolver fails closed without MediaFile row (no invent)", async () => {
    const blobs: Record<string, Uint8Array> = {
      "tenant/org/blob/key.png": TINY_PNG,
    };
    const blobStorage: IBlobStorage = {
      async put(key, data) {
        const bytes =
          typeof data === "string"
            ? Buffer.from(data, "base64")
            : Buffer.from(data);
        blobs[key] = new Uint8Array(bytes);
        return success({ key, size: bytes.length });
      },
      async get(key) {
        const bytes = blobs[key];
        if (!bytes) return success(undefined);
        return success({
          key,
          data: Buffer.from(bytes).toString("base64"),
          contentType: "image/png",
        });
      },
      async delete() {
        return success(undefined);
      },
    };
    const resolver = createMediaFileVaultAssetResolver({ blobStorage });
    const missing = await resolver.resolve({ vaultAssetId: VAULT_ID });
    expect(missing).toBeUndefined();
  });

  it("J — No service-specific runtime branch in MediaFile resolver source", () => {
    const src = fs.readFileSync(
      path.join(
        __dirname,
        "../../../src/platform/cdf/rendering/media-file-vault-asset-resolver.ts",
      ),
      "utf8",
    );
    expect(src).not.toMatch(/serviceId\s*===\s*["']social-media["']/);
    expect(src).not.toMatch(/phaseId\s*===\s*["']final["']/);
    expect(src).not.toMatch(/social-media\.output/);
  });
});
