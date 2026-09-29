/**
 * Framework ArtifactVersion durability / rehydration after process restart.
 * Mirrors REAL HTTP defect: session selectedArtifacts X@V survive;
 * memory ArtifactVersion Maps do not — until ensureCdfArtifactBagLoaded.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import {
  createArtifact,
  createVersion,
  ensureCdfArtifactBagLoaded,
  ensureCdfSessionLoaded,
  flushCdfArtifactBagToMongo,
  getArtifactVersion,
  markApproved,
  markSelected,
  persistCdfSession,
  resetCdfArtifactEngineForTests,
  resetCdfSessionsForTests,
  saveCdfSession,
  upsertSessionArtifactRef,
} from "../../../src/platform/cdf";
import { resolveUpstreamArtifactsForPhase } from "../../../src/platform/cdf/generation-context/resolve-dependencies";
import { fixtureSocialMediaRoutes } from "../../../src/platform/cdf/artifacts/social-media/fixtures";
import { SOCIAL_MEDIA_ARTIFACT_KEYS } from "../../../src/platform/cdf/artifacts/social-media/keys";
import { fixturePresentationStoryline } from "../../../src/platform/cdf/artifacts/presentation";
import { PRESENTATION_ARTIFACT_KEYS } from "../../../src/platform/cdf/artifacts/presentation/keys";
import type { CdfSessionState } from "../../../src/platform/cdf/types";

function sessionStub(input: {
  sessionId: string;
  serviceId: string;
  phaseId: string;
}): CdfSessionState {
  const ts = new Date().toISOString();
  return {
    sessionId: input.sessionId,
    serviceId: input.serviceId,
    organizationId: "org_art_rehydrate",
    projectId: "proj_art_rehydrate",
    contractVersion: "2.0.0-m1",
    sessionVersion: 4,
    status: "active",
    brief: "Artifact durability brief",
    phaseIndex: 3,
    phaseId: input.phaseId,
    approved: [],
    selected: [],
    masters: {},
    modeOwnership: "ai",
    productMode: "ai",
    createdAt: ts,
    updatedAt: ts,
  };
}

function readStoreSource(): string {
  return fs.readFileSync(
    path.join(
      __dirname,
      "../../../src/platform/cdf/artifacts/store.ts",
    ),
    "utf8",
  );
}

function readSessionStoreSource(): string {
  return fs.readFileSync(
    path.join(
      __dirname,
      "../../../src/platform/cdf/session-store.ts",
    ),
    "utf8",
  );
}

describe("CDF ArtifactVersion rehydration (framework)", () => {
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

  async function seedSelectedRoutes() {
    const sessionId = `cdf_art_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const created = createArtifact({
      organizationId: "org_art_rehydrate",
      projectId: "proj_art_rehydrate",
      sessionId,
      serviceId: "social-media",
      phaseId: "routes",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      artifactType: "text_choice",
      data: fixtureSocialMediaRoutes() as never,
    });
    markSelected(created.artifact.artifactId, 1);
    let session = saveCdfSession(
      sessionStub({
        sessionId,
        serviceId: "social-media",
        phaseId: "output",
      }),
    );
    session = upsertSessionArtifactRef(session, {
      artifactId: created.artifact.artifactId,
      version: 1,
      phaseId: "routes",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      role: "generated",
    });
    session = upsertSessionArtifactRef(session, {
      artifactId: created.artifact.artifactId,
      version: 1,
      phaseId: "routes",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      role: "selected",
    });
    saveCdfSession(session);
    await persistCdfSession(session);
    await flushCdfArtifactBagToMongo();
    return {
      sessionId,
      artifactId: created.artifact.artifactId,
      version: 1 as const,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
    };
  }

  it("A — ArtifactVersion persists durably to Mongo bag", async () => {
    const { artifactId } = await seedSelectedRoutes();
    const { loadCdfArtifactBagFromMongo } = await import(
      "../../../src/platform/infrastructure/durability/mongo/models/cdf-artifact.model"
    );
    const snap = await loadCdfArtifactBagFromMongo();
    assert.ok(snap);
    assert.ok(snap!.artifacts.some((a) => a.artifactId === artifactId));
    assert.ok(
      snap!.versions.some((v) => v.artifactId === artifactId && v.version === 1),
    );
  });

  it("B/C — ArtifactVersion exact ID+version resolves after restart", async () => {
    const { sessionId, artifactId, version } = await seedSelectedRoutes();
    assert.equal(getArtifactVersion(artifactId, version).version, version);

    resetCdfSessionsForTests();
    resetCdfArtifactEngineForTests();
    assert.throws(
      () => getArtifactVersion(artifactId, version),
      /ARTIFACT_NOT_FOUND/,
    );

    await ensureCdfSessionLoaded(sessionId);
    const v = getArtifactVersion(artifactId, version);
    assert.equal(v.artifactId, artifactId);
    assert.equal(v.version, version);
    assert.equal(v.artifactKey, SOCIAL_MEDIA_ARTIFACT_KEYS.routes);
    assert.ok(Array.isArray((v.data as { routes?: unknown }).routes));
  });

  it("D — V1 remains resolvable after V2 is created + restart", async () => {
    const { sessionId, artifactId } = await seedSelectedRoutes();
    createVersion({
      artifactId,
      expectedLatestVersion: 1,
      data: {
        ...fixtureSocialMediaRoutes(),
        selectedRouteId: "route_02",
      } as never,
    });
    await flushCdfArtifactBagToMongo();
    assert.equal(getArtifactVersion(artifactId, 1).data.selectedRouteId, "route_01");
    assert.equal(getArtifactVersion(artifactId, 2).data.selectedRouteId, "route_02");

    resetCdfSessionsForTests();
    resetCdfArtifactEngineForTests();
    await ensureCdfSessionLoaded(sessionId);
    assert.equal(getArtifactVersion(artifactId, 1).data.selectedRouteId, "route_01");
    assert.equal(getArtifactVersion(artifactId, 2).version, 2);
  });

  it("E — selectedArtifacts exact X@V resolves downstream after restart", async () => {
    const { sessionId, artifactId, version } = await seedSelectedRoutes();
    resetCdfSessionsForTests();
    resetCdfArtifactEngineForTests();
    const session = await ensureCdfSessionLoaded(sessionId);
    assert.ok(session);
    const pin = session!.selectedArtifacts?.find(
      (r) => r.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
    );
    assert.equal(pin?.artifactId, artifactId);
    assert.equal(pin?.version, version);

    const resolved = resolveUpstreamArtifactsForPhase({
      session: session!,
      serviceId: "social-media",
      phaseId: "output",
      organizationId: "org_art_rehydrate",
      projectId: "proj_art_rehydrate",
    });
    assert.equal(resolved.ok, true);
    if (!resolved.ok) return;
    const up = resolved.upstream.find(
      (u) => u.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
    );
    assert.ok(up);
    assert.equal(up!.artifactId, artifactId);
    assert.equal(up!.version, version);
  });

  it("F — missing artifact fails closed with ARTIFACT_NOT_FOUND", async () => {
    await ensureCdfArtifactBagLoaded();
    assert.throws(
      () => getArtifactVersion("cdfart_missing_ghost_routes", 1),
      /ARTIFACT_NOT_FOUND/,
    );
  });

  it("G — generated-only still fails where requiredRole=selected", async () => {
    const sessionId = `cdf_gen_only_${Date.now().toString(36)}`;
    const created = createArtifact({
      organizationId: "org_art_rehydrate",
      projectId: "proj_art_rehydrate",
      sessionId,
      serviceId: "social-media",
      phaseId: "routes",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      artifactType: "text_choice",
      data: fixtureSocialMediaRoutes() as never,
    });
    let session = saveCdfSession(
      sessionStub({
        sessionId,
        serviceId: "social-media",
        phaseId: "output",
      }),
    );
    session = upsertSessionArtifactRef(session, {
      artifactId: created.artifact.artifactId,
      version: 1,
      phaseId: "routes",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      role: "generated",
    });
    saveCdfSession(session);
    await persistCdfSession(session);
    await flushCdfArtifactBagToMongo();

    resetCdfSessionsForTests();
    resetCdfArtifactEngineForTests();
    const loaded = await ensureCdfSessionLoaded(sessionId);
    const resolved = resolveUpstreamArtifactsForPhase({
      session: loaded!,
      serviceId: "social-media",
      phaseId: "output",
      organizationId: "org_art_rehydrate",
      projectId: "proj_art_rehydrate",
    });
    assert.equal(resolved.ok, false);
    if (resolved.ok) return;
    assert.match(
      `${resolved.code} ${resolved.message}`,
      /ARTIFACT_NOT_FOUND|Missing selected|generated-only|DEPENDENCY/i,
    );
  });

  it("H — Presentation selected-only still fails where requiredRole=approved", async () => {
    const sessionId = `cdf_sel_only_${Date.now().toString(36)}`;
    const created = createArtifact({
      organizationId: "org_art_rehydrate",
      projectId: "proj_art_rehydrate",
      sessionId,
      serviceId: "presentation",
      phaseId: "storyline",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      artifactType: "text_doc",
      data: fixturePresentationStoryline() as never,
    });
    markSelected(created.artifact.artifactId, 1);
    let session = saveCdfSession(
      sessionStub({
        sessionId,
        serviceId: "presentation",
        phaseId: "slide-content",
      }),
    );
    session = upsertSessionArtifactRef(session, {
      artifactId: created.artifact.artifactId,
      version: 1,
      phaseId: "storyline",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      role: "selected",
    });
    saveCdfSession(session);
    await persistCdfSession(session);
    await flushCdfArtifactBagToMongo();

    resetCdfSessionsForTests();
    resetCdfArtifactEngineForTests();
    const loaded = await ensureCdfSessionLoaded(sessionId);
    const resolved = resolveUpstreamArtifactsForPhase({
      session: loaded!,
      serviceId: "presentation",
      phaseId: "slide-content",
      organizationId: "org_art_rehydrate",
      projectId: "proj_art_rehydrate",
    });
    // slide-content requires approved storyline — selected-only must fail closed
    assert.equal(resolved.ok, false);
    if (resolved.ok) return;
    assert.match(
      `${resolved.code} ${resolved.message}`,
      /approved|Missing|ARTIFACT|DEPENDENCY|role/i,
    );
  });

  it("I — another CDF service artifact resolves after restart", async () => {
    const sessionId = `cdf_pres_${Date.now().toString(36)}`;
    const created = createArtifact({
      organizationId: "org_art_rehydrate",
      projectId: "proj_art_rehydrate",
      sessionId,
      serviceId: "presentation",
      phaseId: "storyline",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      artifactType: "text_doc",
      data: fixturePresentationStoryline() as never,
    });
    markApproved(created.artifact.artifactId, 1);
    let session = saveCdfSession(
      sessionStub({
        sessionId,
        serviceId: "presentation",
        phaseId: "slide-content",
      }),
    );
    session = upsertSessionArtifactRef(session, {
      artifactId: created.artifact.artifactId,
      version: 1,
      phaseId: "storyline",
      artifactKey: PRESENTATION_ARTIFACT_KEYS.storyline,
      role: "approved",
    });
    saveCdfSession(session);
    await persistCdfSession(session);
    await flushCdfArtifactBagToMongo();

    resetCdfSessionsForTests();
    resetCdfArtifactEngineForTests();
    await ensureCdfSessionLoaded(sessionId);
    const v = getArtifactVersion(created.artifact.artifactId, 1);
    assert.equal(v.artifactKey, PRESENTATION_ARTIFACT_KEYS.storyline);
    assert.equal(v.version, 1);
  });

  it("J — cache miss falls through to durable repository", async () => {
    const { artifactId } = await seedSelectedRoutes();
    resetCdfArtifactEngineForTests();
    assert.throws(() => getArtifactVersion(artifactId, 1), /ARTIFACT_NOT_FOUND/);
    await ensureCdfArtifactBagLoaded();
    assert.equal(getArtifactVersion(artifactId, 1).artifactId, artifactId);
  });

  it("K — no service-specific runtime branch is introduced", () => {
    const storeSrc = readStoreSource();
    const sessionSrc = readSessionStoreSource();
    assert.equal(/serviceId\s*===\s*["']social-media["']/.test(storeSrc), false);
    assert.equal(/phaseId\s*===\s*["']output["']/.test(storeSrc), false);
    assert.equal(/serviceId\s*===\s*["']social-media["']/.test(sessionSrc), false);
    assert.equal(/phaseId\s*===\s*["']output["']/.test(sessionSrc), false);
    assert.match(sessionSrc, /ensureCdfArtifactBagLoaded/);
    assert.match(storeSrc, /ensureCdfArtifactBagLoaded/);
  });
});
