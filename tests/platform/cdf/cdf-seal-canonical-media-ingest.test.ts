/**
 * Seal: canonical media MUST pass generic Vault→candidate bridge before family adapters.
 * route_visual / legacy must not enter. No serviceId runtime branches.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { applyCdfCanonicalCompletionIngest } from "../../../src/platform/api/services/execution-cdf-canonical-ingest";
import {
  buildCanonicalImageIngestCandidate,
  classifyPackagingProviderOutput,
  classifySocialMediaProviderOutput,
  contractRequiresCanonicalImageIngest,
  createArtifact,
  fixtureSocialMediaRoutes,
  markSelected,
  persistCdfSession,
  resetCdfArtifactEngineForTests,
  resetCdfSessionsForTests,
  saveCdfSession,
  SOCIAL_MEDIA_ARTIFACT_KEYS,
  upsertSessionArtifactRef,
} from "../../../src/platform/cdf";
import type { CdfPhaseExecutionContract } from "../../../src/platform/cdf/canonical";
import type { CdfSessionState } from "../../../src/platform/cdf/types";
import type { AsyncMediaPlatform } from "../../../src/platform/infrastructure/durability/create-async-media-platform";
import { EnterpriseArtifact } from "../../../src/platform/infrastructure/durability/mongo/models/enterprise-artifact.model";
import { EnterpriseBlobMetadata } from "../../../src/platform/infrastructure/durability/mongo/models/enterprise-blob-metadata.model";
import { isVaultAssetObjectIdShape } from "../../../src/platform/cdf/artifacts/ids";
import {
  installFixtureRenderedTextProofProducer,
  uninstallFixtureRenderedTextProofProducer,
} from "./helpers/fixture-rendered-text-proof";

const ORG = "6a8d8d7dc263a4d6afe69691";
const PROJ = "proj_seal_media";

function fakeAsyncMedia(): AsyncMediaPlatform {
  return {
    artifacts: { finalized: new Map() },
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

function sessionStub(
  sessionId: string,
  serviceId: string,
  phaseId: string,
): CdfSessionState {
  const ts = new Date().toISOString();
  return {
    sessionId,
    serviceId,
    organizationId: ORG,
    projectId: PROJ,
    contractVersion: "2.0.0-m1",
    sessionVersion: 4,
    status: "active",
    brief: "Seal media brief",
    phaseIndex: 3,
    phaseId,
    approved: [],
    selected: [],
    masters: {},
    modeOwnership: "ai",
    productMode: "ai",
    createdAt: ts,
    updatedAt: ts,
  };
}

function outputMeta(sessionId: string): Record<string, unknown> {
  return {
    cdfSessionId: sessionId,
    cdfPhaseId: "output",
    cdfServiceId: "social-media",
    cdfExecutionStrategy: "canonical",
    cdfArtifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
    cdfGenerationModality: "image",
    productAction: "generate",
  };
}

describe("Seal generic canonical media ingest", () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  }, 120_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfArtifactEngineForTests();
    // Deterministic synthetic OCR for ingest paths without vault image bytes.
    // Production boot registers tesseract; tests isolate with this fixture.
    installFixtureRenderedTextProofProducer();
  });

  afterEach(() => {
    uninstallFixtureRenderedTextProofProducer();
  });

  async function seedSocialRoutes(sessionId: string) {
    const created = createArtifact({
      organizationId: ORG,
      projectId: PROJ,
      sessionId,
      serviceId: "social-media",
      phaseId: "routes",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      artifactType: "text_choice",
      data: fixtureSocialMediaRoutes() as never,
    });
    markSelected(created.artifact.artifactId, 1);
    let session = saveCdfSession(sessionStub(sessionId, "social-media", "output"));
    session = upsertSessionArtifactRef(session, {
      artifactId: created.artifact.artifactId,
      version: 1,
      phaseId: "routes",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      role: "selected",
    });
    saveCdfSession(session);
    await persistCdfSession(session);
  }

  async function seedExecutionMedia(artId: string, executionId: string) {
    const storageKey = `tenant/test/executions/${executionId}/artifacts/${artId}/output-0.png`;
    await EnterpriseArtifact.create({
      artifactId: artId,
      executionId,
      organizationId: ORG,
      kind: "media",
      label: `blob:${storageKey}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await EnterpriseBlobMetadata.create({
      storageKey,
      organizationId: ORG,
      artifactId: artId,
      mimeType: "image/png",
      sizeBytes: 128,
      checksum: "abc",
      createdAt: new Date().toISOString(),
    });
  }

  it("canonical image + Vault asset → accepted", async () => {
    const sessionId = `cdf_seal_img_${Date.now().toString(36)}`;
    const executionId = `exec_seal_img_${Date.now()}`;
    const artId = `art_seal_img_${Date.now()}_0`;
    await seedSocialRoutes(sessionId);
    await seedExecutionMedia(artId, executionId);

    const ingest = await applyCdfCanonicalCompletionIngest({
      status: "succeeded",
      workingMetadata: outputMeta(sessionId),
      // Non-text leftover that previously could skip the bridge
      structuredCandidate: { routes: [{ name: "stale" }] },
      mediaArtifactIds: [artId],
      executionId,
      organizationId: ORG,
      projectId: PROJ,
      asyncMedia: fakeAsyncMedia(),
      logOsExecutionEvent: () => undefined,
    });

    assert.equal(ingest.productCompletionBlocked, false);
    assert.ok(ingest.socialMediaCanonicalAttach);
    assert.match(String(ingest.socialMediaCanonicalAttach!.cdfArtifactId), /^cdfart_/);
    assert.ok(ingest.cdfVaultAssetIds?.length);
    assert.ok(isVaultAssetObjectIdShape(ingest.cdfVaultAssetIds![0]!));
  });

  it("canonical video + Vault asset → accepted (generic candidate)", () => {
    const contract: CdfPhaseExecutionContract = {
      executionStrategy: "canonical",
      generationModality: "video",
      artifactKey: "social-media.output",
      semanticRole: "generated",
    } as CdfPhaseExecutionContract;
    const vaultAssetId = "aaaaaaaaaaaaaaaaaaaaaaaa";
    const built = buildCanonicalImageIngestCandidate({ contract, vaultAssetId });
    assert.ok(!("ok" in built));
    if ("ok" in built) return;
    assert.equal(built.vaultAssetId, vaultAssetId);
    assert.equal(
      classifySocialMediaProviderOutput(
        SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        built.rawOutput,
      ),
      "mixed_structured_plus_asset",
    );
  });

  it("canonical hybrid + Vault asset → accepted (generic candidate)", () => {
    const contract: CdfPhaseExecutionContract = {
      executionStrategy: "canonical",
      generationModality: "hybrid",
      artifactKey: "packaging.front-pack",
      semanticRole: "generated",
    } as CdfPhaseExecutionContract;
    const vaultAssetId = "bbbbbbbbbbbbbbbbbbbbbbbb";
    const built = buildCanonicalImageIngestCandidate({ contract, vaultAssetId });
    assert.ok(!("ok" in built));
    if ("ok" in built) return;
    assert.equal(
      classifyPackagingProviderOutput("packaging.front-pack", built.rawOutput),
      "mixed_structured_plus_asset",
    );
  });

  it("canonical image without Vault promotion → productCompletionBlocked", async () => {
    const sessionId = `cdf_seal_novault_${Date.now().toString(36)}`;
    await seedSocialRoutes(sessionId);

    const ingest = await applyCdfCanonicalCompletionIngest({
      status: "succeeded",
      workingMetadata: outputMeta(sessionId),
      structuredCandidate: null,
      mediaArtifactIds: ["art_missing_blob_0"],
      executionId: "exec_seal_novault",
      organizationId: ORG,
      projectId: PROJ,
      asyncMedia: fakeAsyncMedia(),
      logOsExecutionEvent: () => undefined,
    });

    assert.equal(ingest.productCompletionBlocked, true);
    assert.equal(ingest.socialMediaCanonicalAttach, null);
  });

  it("prose-only canonical text_choice → rejected", async () => {
    const sessionId = `cdf_seal_prose_${Date.now().toString(36)}`;
    const session = saveCdfSession(
      sessionStub(sessionId, "social-media", "routes"),
    );
    await persistCdfSession(session);

    const ingest = await applyCdfCanonicalCompletionIngest({
      status: "succeeded",
      workingMetadata: {
        cdfSessionId: sessionId,
        cdfPhaseId: "routes",
        cdfServiceId: "social-media",
        cdfExecutionStrategy: "canonical",
        cdfArtifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
        cdfGenerationModality: "text",
      },
      structuredCandidate: "Here are three creative directions in prose only.",
      mediaArtifactIds: [],
      executionId: "exec_seal_prose",
      organizationId: ORG,
      projectId: PROJ,
      logOsExecutionEvent: () => undefined,
    });

    assert.equal(ingest.productCompletionBlocked, true);
    assert.equal(ingest.socialMediaCanonicalAttach, null);
  });

  it("route_visual → does not enter canonical bridge", () => {
    assert.equal(
      contractRequiresCanonicalImageIngest({
        cdfSessionId: "cdf_rv",
        cdfServiceId: "social-media",
        cdfPhaseId: "output",
        cdfExecutionStrategy: "route_visual",
        productAction: "route_visual",
      }),
      undefined,
    );
  });

  it("legacy → does not enter canonical bridge", () => {
    assert.equal(
      contractRequiresCanonicalImageIngest({
        cdfSessionId: "cdf_leg",
        cdfServiceId: "social-media",
        cdfPhaseId: "output",
        cdfExecutionStrategy: "legacy",
      }),
      undefined,
    );
  });

  it("Packaging canonical media parity (Vault seed classified capable)", () => {
    const vaultAssetId = "cccccccccccccccccccccccc";
    const contract = {
      executionStrategy: "canonical",
      generationModality: "image",
      artifactKey: "packaging.front-pack",
    } as CdfPhaseExecutionContract;
    const built = buildCanonicalImageIngestCandidate({ contract, vaultAssetId });
    assert.ok(!("ok" in built));
    if ("ok" in built) return;
    assert.equal(
      classifyPackagingProviderOutput("packaging.front-pack", built.rawOutput),
      "mixed_structured_plus_asset",
    );
  });

  it("Social canonical media parity (Vault seed classified capable)", () => {
    const vaultAssetId = "dddddddddddddddddddddddd";
    const contract = {
      executionStrategy: "canonical",
      generationModality: "image",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
    } as CdfPhaseExecutionContract;
    const built = buildCanonicalImageIngestCandidate({ contract, vaultAssetId });
    assert.ok(!("ok" in built));
    if ("ok" in built) return;
    assert.equal(
      classifySocialMediaProviderOutput(
        SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        built.rawOutput,
      ),
      "mixed_structured_plus_asset",
    );
  });

  it("no serviceId-specific branching in bridge / contract gate", () => {
    const bridge = fs.readFileSync(
      path.join(
        __dirname,
        "../../../src/platform/api/services/execution-cdf-canonical-ingest.ts",
      ),
      "utf8",
    );
    const candidate = fs.readFileSync(
      path.join(
        __dirname,
        "../../../src/platform/cdf/generation-artifact/build-canonical-image-candidate.ts",
      ),
      "utf8",
    );
    assert.equal(/serviceId\s*===\s*["']social-media["']/.test(bridge), false);
    assert.equal(/serviceId\s*===\s*["']packaging["']/.test(bridge), false);
    assert.equal(/phaseId\s*===\s*["']output["']/.test(candidate), false);
    assert.equal(/serviceId\s*===\s*["']social-media["']/.test(candidate), false);
  });
});
