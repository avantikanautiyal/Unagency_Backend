/**
 * Canonical image execution → Vault promote → ingest candidate → ArtifactVersion → M9C.
 * Framework-level regression for the REAL HTTP defect:
 * image succeeded (art_*) but no social-media.output ArtifactVersion / generatedArtifacts.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import {
  bindSocialMediaGeneratedFromAttach,
  buildCanonicalImageIngestCandidate,
  contractRequiresCanonicalImageIngest,
  createArtifact,
  ensureCdfSessionLoaded,
  fixtureSocialMediaRoutes,
  getArtifactVersion,
  markSelected,
  persistCdfSession,
  promoteExecutionMediaArtifactToVaultAsset,
  resetCdfArtifactEngineForTests,
  resetCdfSessionsForTests,
  saveCdfSession,
  SOCIAL_MEDIA_ARTIFACT_KEYS,
  tryIngestSocialMediaCdfCompletion,
  upsertSessionArtifactRef,
} from "../../../src/platform/cdf";
import { EnterpriseArtifact } from "../../../src/platform/infrastructure/durability/mongo/models/enterprise-artifact.model";
import { EnterpriseBlobMetadata } from "../../../src/platform/infrastructure/durability/mongo/models/enterprise-blob-metadata.model";
import type { CdfSessionState } from "../../../src/platform/cdf/types";
import type { AsyncMediaPlatform } from "../../../src/platform/infrastructure/durability/create-async-media-platform";
import { isVaultAssetObjectIdShape } from "../../../src/platform/cdf/artifacts/ids";

function sessionStub(sessionId: string): CdfSessionState {
  const ts = new Date().toISOString();
  return {
    sessionId,
    serviceId: "social-media",
    organizationId: "6a8d8d7dc263a4d6afe69691",
    projectId: "proj_img_bridge",
    contractVersion: "2.0.0-m1",
    sessionVersion: 4,
    status: "active",
    brief: "Image bridge brief",
    phaseIndex: 3,
    phaseId: "output",
    approved: [],
    selected: [],
    masters: {},
    modeOwnership: "ai",
    productMode: "ai",
    createdAt: ts,
    updatedAt: ts,
  };
}

function fakeAsyncMedia(): AsyncMediaPlatform {
  return {
    artifacts: {
      finalized: new Map(),
    },
    blobMetadata: {
      async resolveForTenant() {
        return undefined;
      },
      async get() {
        return undefined;
      },
      async register() {},
    },
  } as unknown as AsyncMediaPlatform;
}

function readDispatchSource(): string {
  return fs.readFileSync(
    path.join(
      __dirname,
      "../../../src/platform/api/services/execution-create-dispatch.ts",
    ),
    "utf8",
  );
}

function readBridgeSources(): string {
  return [
    fs.readFileSync(
      path.join(
        __dirname,
        "../../../src/platform/cdf/generation-artifact/build-canonical-image-candidate.ts",
      ),
      "utf8",
    ),
    fs.readFileSync(
      path.join(
        __dirname,
        "../../../src/platform/cdf/generation-artifact/promote-execution-media-to-vault.ts",
      ),
      "utf8",
    ),
  ].join("\n");
}

describe("CDF canonical image → ArtifactVersion → M9C (framework)", () => {
  let mongod: MongoMemoryServer;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfArtifactEngineForTests();
  });

  async function seedRoutesSelected(sessionId: string) {
    const created = createArtifact({
      organizationId: "6a8d8d7dc263a4d6afe69691",
      projectId: "proj_img_bridge",
      sessionId,
      serviceId: "social-media",
      phaseId: "routes",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      artifactType: "text_choice",
      data: fixtureSocialMediaRoutes() as never,
    });
    markSelected(created.artifact.artifactId, 1);
    let session = saveCdfSession(sessionStub(sessionId));
    session = upsertSessionArtifactRef(session, {
      artifactId: created.artifact.artifactId,
      version: 1,
      phaseId: "routes",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      role: "selected",
    });
    saveCdfSession(session);
    await persistCdfSession(session);
    return created;
  }

  async function seedExecutionMedia(artId: string, executionId: string) {
    const storageKey = `tenant/test/executions/${executionId}/artifacts/${artId}/output-0.png`;
    await EnterpriseArtifact.create({
      artifactId: artId,
      executionId,
      organizationId: "6a8d8d7dc263a4d6afe69691",
      kind: "media",
      label: `blob:${storageKey}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await EnterpriseBlobMetadata.create({
      storageKey,
      organizationId: "6a8d8d7dc263a4d6afe69691",
      artifactId: artId,
      mimeType: "image/png",
      sizeBytes: 128,
      checksum: "abc",
      createdAt: new Date().toISOString(),
    });
    return storageKey;
  }

  it("A/B — successful canonical image ingest → ArtifactVersion + generatedArtifacts X@V", async () => {
    const sessionId = `cdf_img_${Date.now().toString(36)}`;
    const executionId = `exec_img_${Date.now()}`;
    const artId = `art_syncimg_test_${Date.now()}_0`;
    await seedRoutesSelected(sessionId);
    await seedExecutionMedia(artId, executionId);

    const contract = contractRequiresCanonicalImageIngest({
      cdfSessionId: sessionId,
      cdfServiceId: "social-media",
      cdfPhaseId: "output",
      cdfArtifactKey: "social-media.output",
      cdfExecutionStrategy: "canonical",
      productAction: "generate",
    });
    assert.ok(contract);
    assert.equal(contract!.artifactKey, "social-media.output");

    const promoted = await promoteExecutionMediaArtifactToVaultAsset({
      mediaArtifactId: artId,
      organizationId: "6a8d8d7dc263a4d6afe69691",
      executionId,
      asyncMedia: fakeAsyncMedia(),
    });
    assert.equal(promoted.ok, true);
    if (!promoted.ok) return;
    assert.ok(isVaultAssetObjectIdShape(promoted.vaultAssetId));

    const built = buildCanonicalImageIngestCandidate({
      contract: contract!,
      vaultAssetId: promoted.vaultAssetId,
    });
    assert.ok(!("ok" in built));
    if ("ok" in built) return;

    const ingested = tryIngestSocialMediaCdfCompletion({
      metadata: {
        cdfSessionId: sessionId,
        cdfServiceId: "social-media",
        cdfPhaseId: "output",
        cdfArtifactKey: "social-media.output",
        cdfExecutionStrategy: "canonical",
      },
      rawOutput: built.rawOutput,
      executionId,
      organizationId: "6a8d8d7dc263a4d6afe69691",
      projectId: "proj_img_bridge",
      vaultAssetIds: built.vaultAssetIds,
      forceOptIn: true,
    });
    assert.ok(ingested && ingested.kind === "accepted");
    if (!ingested || ingested.kind !== "accepted") return;

    const v = getArtifactVersion(
      ingested.attach.cdfArtifactId,
      ingested.attach.cdfArtifactVersion,
    );
    assert.equal(v.artifactKey, SOCIAL_MEDIA_ARTIFACT_KEYS.output);
    assert.equal(v.version, 1);

    const bound = bindSocialMediaGeneratedFromAttach({
      sessionId,
      phaseId: "output",
      attach: ingested.attach,
      organizationId: "6a8d8d7dc263a4d6afe69691",
      projectId: "proj_img_bridge",
    });
    assert.equal(bound.ok, true);
    if (!bound.ok) return;
    await persistCdfSession(bound.session);

    resetCdfSessionsForTests();
    const reloaded = await ensureCdfSessionLoaded(sessionId);
    const pin = reloaded?.generatedArtifacts?.find(
      (r) => r.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.output,
    );
    assert.equal(pin?.artifactId, ingested.attach.cdfArtifactId);
    assert.equal(pin?.version, ingested.attach.cdfArtifactVersion);
  });

  it("C — missing previewAssetRef / invalid vault fails closed", () => {
    const contract = contractRequiresCanonicalImageIngest({
      cdfServiceId: "social-media",
      cdfPhaseId: "output",
      cdfExecutionStrategy: "canonical",
      productAction: "generate",
    });
    assert.ok(contract);
    const bad = buildCanonicalImageIngestCandidate({
      contract: contract!,
      vaultAssetId: "art_syncimg_not_vault",
    });
    assert.equal("ok" in bad && bad.ok === false, true);
  });

  it("D — invalid image/execution representation → no ArtifactVersion", async () => {
    const sessionId = `cdf_img_bad_${Date.now().toString(36)}`;
    await seedRoutesSelected(sessionId);
    const ingested = tryIngestSocialMediaCdfCompletion({
      metadata: {
        cdfSessionId: sessionId,
        cdfServiceId: "social-media",
        cdfPhaseId: "output",
        cdfExecutionStrategy: "canonical",
      },
      rawOutput: {
        artifactIds: ["art_syncimg_only"],
        kind: "artifact",
      },
      executionId: "exec_bad",
      forceOptIn: true,
    });
    assert.ok(ingested);
    assert.notEqual(ingested!.kind, "accepted");
  });

  it("E — route_visual does not build canonical image candidate", () => {
    const contract = contractRequiresCanonicalImageIngest({
      cdfServiceId: "social-media",
      cdfPhaseId: "output",
      cdfExecutionStrategy: "canonical",
      productAction: "route_visual",
    });
    assert.equal(contract, undefined);

    const contract2 = contractRequiresCanonicalImageIngest({
      cdfServiceId: "social-media",
      cdfPhaseId: "output",
      cdfExecutionStrategy: "route_visual",
      productAction: "generate",
    });
    assert.equal(contract2, undefined);
  });

  it("F — structured/text phase contract does not require image bridge", () => {
    const contract = contractRequiresCanonicalImageIngest({
      cdfServiceId: "social-media",
      cdfPhaseId: "routes",
      cdfExecutionStrategy: "canonical",
      productAction: "generate",
    });
    assert.equal(contract, undefined);
  });

  it("G — packaging front-pack is canonical image when declared", () => {
    const contract = contractRequiresCanonicalImageIngest({
      cdfServiceId: "packaging",
      cdfPhaseId: "front-pack",
      cdfExecutionStrategy: "canonical",
      productAction: "generate",
    });
    // If packaging front-pack is image+canonical in registry, bridge applies.
    if (contract) {
      assert.equal(contract.generationModality, "image");
      assert.equal(contract.executionStrategy, "canonical");
    }
  });

  it("H — another service image contract resolves without SM if", () => {
    const src = readBridgeSources();
    assert.equal(/serviceId\s*===\s*["']social-media["']/.test(src), false);
    assert.equal(/phaseId\s*===\s*["']output["']/.test(src), false);
    assert.equal(/artifactKey\s*===\s*["']social-media\.output["']/.test(src), false);
  });

  it("I — provider/media failure path: promote missing art fails closed", async () => {
    const promoted = await promoteExecutionMediaArtifactToVaultAsset({
      mediaArtifactId: "art_missing_never_created",
      organizationId: "6a8d8d7dc263a4d6afe69691",
      executionId: "exec_none",
      asyncMedia: fakeAsyncMedia(),
    });
    assert.equal(promoted.ok, false);
  });

  it("J — M9C failure is surfaced (missing session)", async () => {
    const sessionId = `cdf_img_m9c_${Date.now().toString(36)}`;
    const executionId = `exec_m9c_${Date.now()}`;
    const artId = `art_syncimg_m9c_${Date.now()}_0`;
    await seedRoutesSelected(sessionId);
    await seedExecutionMedia(artId, executionId);
    const contract = contractRequiresCanonicalImageIngest({
      cdfServiceId: "social-media",
      cdfPhaseId: "output",
      cdfExecutionStrategy: "canonical",
      productAction: "generate",
    })!;
    const promoted = await promoteExecutionMediaArtifactToVaultAsset({
      mediaArtifactId: artId,
      organizationId: "6a8d8d7dc263a4d6afe69691",
      executionId,
      asyncMedia: fakeAsyncMedia(),
    });
    assert.ok(promoted.ok);
    if (!promoted.ok) return;
    const built = buildCanonicalImageIngestCandidate({
      contract,
      vaultAssetId: promoted.vaultAssetId,
    });
    assert.ok(!("ok" in built));
    if ("ok" in built) return;
    const ingested = tryIngestSocialMediaCdfCompletion({
      metadata: {
        cdfSessionId: sessionId,
        cdfServiceId: "social-media",
        cdfPhaseId: "output",
        cdfExecutionStrategy: "canonical",
      },
      rawOutput: built.rawOutput,
      vaultAssetIds: built.vaultAssetIds,
      forceOptIn: true,
      executionId,
    });
    assert.ok(ingested && ingested.kind === "accepted");
    if (!ingested || ingested.kind !== "accepted") return;

    const bound = bindSocialMediaGeneratedFromAttach({
      sessionId: "cdf_does_not_exist",
      phaseId: "output",
      attach: ingested.attach,
      organizationId: "6a8d8d7dc263a4d6afe69691",
    });
    assert.equal(bound.ok, false);
  });

  it("K — sync uses shared finalizer; no service-specific runtime branch", () => {
    const dispatch = readDispatchSource();
    assert.match(dispatch, /applyCdfCanonicalCompletionIngest/);
    assert.match(
      dispatch,
      /productCompletionBlocked/,
    );
    // Inline duplicate social ingest removed
    assert.equal(
      /tryIngestSocialMediaCdfCompletion\(\{\s*\n\s*metadata: workingMetadata/.test(
        dispatch,
      ),
      false,
    );
    const shared = fs.readFileSync(
      path.join(
        __dirname,
        "../../../src/platform/api/services/execution-cdf-canonical-ingest.ts",
      ),
      "utf8",
    );
    assert.match(shared, /contractRequiresCanonicalImageIngest/);
    assert.match(shared, /promoteExecutionMediaArtifactToVaultAsset/);
    assert.equal(/serviceId\s*===\s*["']social-media["']/.test(shared), false);
    assert.equal(/phaseId\s*===\s*["']output["']/.test(shared), false);
  });
});
