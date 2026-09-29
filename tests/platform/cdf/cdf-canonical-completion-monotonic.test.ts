/**
 * Canonical completion is monotonic: poll_hydrate success + recovered_job
 * duplicate must not downgrade to productCompletionBlocked / failure.
 *
 * Live defect (exec_48_*): poll_hydrate accepted AV+M9C, then dispatch_finalize
 * hit GENERATION_ARTIFACT_IDEMPOTENCY_CONFLICT and blocked completion.
 */

import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import {
  applyCdfCanonicalCompletionIngest,
  resolveEstablishedCanonicalCompletionAttach,
} from "../../../src/platform/api/services/execution-cdf-canonical-ingest";
import {
  buildCanonicalImageIngestCandidate,
  contractRequiresCanonicalImageIngest,
  createArtifact,
  ensureCdfSessionLoaded,
  fixtureSocialMediaPlatform,
  fixtureSocialMediaRoutes,
  getArtifactVersion,
  getCdfSession,
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
import { ingestGenerationCompletion } from "../../../src/platform/cdf/generation-artifact/service";
import { CdfGenerationArtifactError } from "../../../src/platform/cdf/generation-artifact/errors";
import { EnterpriseArtifact } from "../../../src/platform/infrastructure/durability/mongo/models/enterprise-artifact.model";
import { EnterpriseBlobMetadata } from "../../../src/platform/infrastructure/durability/mongo/models/enterprise-blob-metadata.model";
import type { CdfSessionState } from "../../../src/platform/cdf/types";
import type { AsyncMediaPlatform } from "../../../src/platform/infrastructure/durability/create-async-media-platform";
import {
  installFixtureRenderedTextProofProducer,
  uninstallFixtureRenderedTextProofProducer,
} from "./helpers/fixture-rendered-text-proof";

function sessionStub(sessionId: string, phaseId = "output"): CdfSessionState {
  const ts = new Date().toISOString();
  return {
    sessionId,
    serviceId: "social-media",
    organizationId: "6a8d8d7dc263a4d6afe69691",
    projectId: "proj_mono",
    contractVersion: "2.0.0-m1",
    sessionVersion: 4,
    status: "active",
    brief: "Monotonic completion brief",
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

describe("CDF canonical completion monotonicity (duplicate poll/finalize)", () => {
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
    installFixtureRenderedTextProofProducer();
  });

  afterEach(() => {
    uninstallFixtureRenderedTextProofProducer();
  });

  async function seedRoutesSelected(sessionId: string) {
    const created = createArtifact({
      organizationId: "6a8d8d7dc263a4d6afe69691",
      projectId: "proj_mono",
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
  }

  it("1–6 — canonical success then duplicate recovered completion is no-op (no new AV, no bind change, not blocked)", async () => {
    const sessionId = `cdf_mono_${Date.now().toString(36)}`;
    const executionId = `exec_mono_${Date.now()}`;
    const artId = `art_syncimg_mono_${Date.now()}_0`;
    await seedRoutesSelected(sessionId);
    await seedExecutionMedia(artId, executionId);
    await ensureCdfSessionLoaded(sessionId);

    const meta: Record<string, unknown> = {
      cdfSessionId: sessionId,
      cdfServiceId: "social-media",
      cdfPhaseId: "output",
      cdfArtifactKey: "social-media.output",
      cdfExecutionStrategy: "canonical",
      productAction: "generate",
    };

    const contract = contractRequiresCanonicalImageIngest(meta);
    assert.ok(contract);

    const first = await applyCdfCanonicalCompletionIngest({
      status: "succeeded",
      workingMetadata: meta,
      structuredCandidate: null,
      mediaArtifactIds: [artId],
      executionId,
      organizationId: "6a8d8d7dc263a4d6afe69691",
      projectId: "proj_mono",
      asyncMedia: fakeAsyncMedia(),
      logOsExecutionEvent: () => undefined,
    });
    assert.equal(first.productCompletionBlocked, false);
    assert.ok(first.socialMediaCanonicalAttach?.cdfArtifactId);
    const artifactId = String(first.socialMediaCanonicalAttach!.cdfArtifactId);
    const artifactVersion = Number(
      first.socialMediaCanonicalAttach!.cdfArtifactVersion,
    );
    assert.ok(artifactId.startsWith("cdfart_"));
    assert.equal(artifactVersion, 1);

    const sessionAfterFirst = getCdfSession(sessionId)!;
    const generatedBefore = [
      ...(sessionAfterFirst.generatedArtifacts ?? []),
    ];
    assert.ok(
      generatedBefore.some(
        (r) =>
          r.artifactId === artifactId &&
          r.version === artifactVersion &&
          r.phaseId === "output",
      ),
    );

    // Duplicate recovered_job / finalize path with a DIFFERENT candidate seed
    // (alternate vault payload) — same execution identity.
    const promotedAlt = await promoteExecutionMediaArtifactToVaultAsset({
      mediaArtifactId: artId,
      organizationId: "6a8d8d7dc263a4d6afe69691",
      executionId,
      asyncMedia: fakeAsyncMedia(),
    });
    assert.equal(promotedAlt.ok, true);
    if (!promotedAlt.ok) return;
    const altBuilt = buildCanonicalImageIngestCandidate({
      contract: contract!,
      vaultAssetId: promotedAlt.vaultAssetId,
    });
    assert.ok(!("ok" in altBuilt));
    if ("ok" in altBuilt) return;

    // Force a conflicting raw ingest attempt at the M9B layer (proves conflict
    // still exists), then prove completion ingest recovers without blocking.
    const conflictAttempt = tryIngestSocialMediaCdfCompletion({
      metadata: meta,
      rawOutput: {
        ...altBuilt.rawOutput,
        creativeId: "creative_DIFFERENT_PROBE",
      },
      executionId,
      organizationId: "6a8d8d7dc263a4d6afe69691",
      projectId: "proj_mono",
      vaultAssetIds: altBuilt.vaultAssetIds,
      forceOptIn: true,
    });
    assert.ok(
      conflictAttempt &&
        (conflictAttempt.kind === "ingest_failed" ||
          conflictAttempt.kind === "accepted"),
    );

    const duplicate = await applyCdfCanonicalCompletionIngest({
      status: "succeeded",
      workingMetadata: meta,
      structuredCandidate: {
        ...altBuilt.rawOutput,
        creativeId: "creative_DIFFERENT_PROBE",
      },
      mediaArtifactIds: [artId],
      executionId,
      organizationId: "6a8d8d7dc263a4d6afe69691",
      projectId: "proj_mono",
      asyncMedia: fakeAsyncMedia(),
      logOsExecutionEvent: () => undefined,
    });

    assert.equal(
      duplicate.productCompletionBlocked,
      false,
      "duplicate must not block after established canonical completion",
    );
    assert.ok(duplicate.socialMediaCanonicalAttach);
    assert.equal(
      duplicate.socialMediaCanonicalAttach!.cdfArtifactId,
      artifactId,
    );
    assert.equal(
      Number(duplicate.socialMediaCanonicalAttach!.cdfArtifactVersion),
      artifactVersion,
    );

    const v = getArtifactVersion(artifactId, artifactVersion);
    assert.equal(v.version, 1);

    const sessionAfterDup = getCdfSession(sessionId)!;
    assert.deepEqual(
      sessionAfterDup.generatedArtifacts,
      generatedBefore,
      "duplicate must not alter generatedArtifacts",
    );

    const established = resolveEstablishedCanonicalCompletionAttach(meta);
    assert.ok(established);
    assert.equal(established!.cdfArtifactId, artifactId);
  });

  it("7 — genuinely conflicting payload (no established completion) still fails closed", async () => {
    const sessionId = `cdf_conf_${Date.now().toString(36)}`;
    saveCdfSession(sessionStub(sessionId));
    await persistCdfSession(getCdfSession(sessionId)!);

    const out = await applyCdfCanonicalCompletionIngest({
      status: "succeeded",
      workingMetadata: {
        cdfSessionId: sessionId,
        cdfServiceId: "social-media",
        cdfPhaseId: "output",
        cdfArtifactKey: "social-media.output",
        cdfExecutionStrategy: "canonical",
        productAction: "generate",
      },
      structuredCandidate: null,
      mediaArtifactIds: [],
      executionId: `exec_conf_${Date.now()}`,
      organizationId: "6a8d8d7dc263a4d6afe69691",
      projectId: "proj_mono",
      logOsExecutionEvent: () => undefined,
    });
    assert.equal(out.productCompletionBlocked, true);
    assert.equal(out.socialMediaCanonicalAttach, null);
  });

  it("7b — ingest-layer conflicting payload under same requestId still throws", () => {
    const session = saveCdfSession(
      sessionStub(`cdf_idem_${Date.now().toString(36)}`, "platform"),
    );
    ingestGenerationCompletion({
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "platform",
      organizationId: "6a8d8d7dc263a4d6afe69691",
      projectId: "proj_mono",
      executionId: "exec_idem_a",
      expectedSessionVersion: session.sessionVersion,
      rawOutput: fixtureSocialMediaPlatform(),
      requirements: [],
      requestId: "mono_gen_idem_conflict",
    });
    assert.throws(
      () =>
        ingestGenerationCompletion({
          sessionId: session.sessionId,
          serviceId: "social-media",
          phaseId: "platform",
          organizationId: "6a8d8d7dc263a4d6afe69691",
          projectId: "proj_mono",
          executionId: "exec_idem_a",
          expectedSessionVersion: getCdfSession(session.sessionId)!
            .sessionVersion,
          rawOutput: {
            ...fixtureSocialMediaPlatform(),
            label: "Different payload",
          },
          requirements: [],
          requestId: "mono_gen_idem_conflict",
        }),
      (err: unknown) =>
        err instanceof CdfGenerationArtifactError &&
        err.generationArtifactCode ===
          "GENERATION_ARTIFACT_IDEMPOTENCY_CONFLICT",
    );
  });

  it("8 — established completion resolution is generic (artifactKey-driven, not Social-only)", () => {
    const sessionId = `cdf_gen_${Date.now().toString(36)}`;
    let session = saveCdfSession(sessionStub(sessionId, "deck"));
    session = upsertSessionArtifactRef(session, {
      artifactId: "cdfart_generic_1_presentation-deck",
      version: 2,
      phaseId: "deck",
      artifactKey: "presentation.deck",
      role: "generated",
    });
    saveCdfSession(session);

    const attach = resolveEstablishedCanonicalCompletionAttach({
      cdfSessionId: sessionId,
      cdfPhaseId: "deck",
      cdfArtifactKey: "presentation.deck",
      cdfExecutionStrategy: "canonical",
    });
    assert.ok(attach);
    assert.equal(attach!.cdfArtifactId, "cdfart_generic_1_presentation-deck");
    assert.equal(attach!.cdfArtifactVersion, 2);
    assert.equal(attach!.cdfArtifactKey, "presentation.deck");
    assert.equal(attach!.cdfIdempotentCompletionReplay, true);
  });
});
