/**
 * CDF Final lifecycle — output approve (contract) → Final resolves exact X@V.
 * Framework-level; no service-specific runtime branches under test.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  applyCdfTransition,
  createArtifact,
  createVersion,
  ensureCdfSessionLoaded,
  getArtifactVersion,
  markApproved,
  markSelected,
  persistCdfSession,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  resolveUpstreamArtifactsForPhase,
  saveCdfSession,
  SOCIAL_MEDIA_ARTIFACT_KEYS,
  upsertSessionArtifactRef,
} from "../../../src/platform/cdf";
import {
  fixtureSocialMediaOutput,
  fixtureSocialMediaRoutes,
  SOCIAL_MEDIA_FIXTURE_IDS,
} from "../../../src/platform/cdf/artifacts/social-media/fixtures";
import {
  resolveCdfPhaseDependencies,
  resolveCdfPhaseExecutionContract,
} from "../../../src/platform/cdf/canonical";
import type { CdfSessionState } from "../../../src/platform/cdf/types";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { flushCdfArtifactBagToMongo } from "../../../src/platform/cdf/artifacts/store";

function readApproveSource(): string {
  return fs.readFileSync(
    path.join(
      __dirname,
      "../../../src/platform/cdf/state-machine/execute-action.ts",
    ),
    "utf8",
  );
}

function baseSession(partial: Partial<CdfSessionState> & { sessionId: string; serviceId: string; phaseId: string }): CdfSessionState {
  const ts = new Date().toISOString();
  return {
    organizationId: "org_final",
    projectId: "proj_final",
    contractVersion: "2.0.0-m1",
    sessionVersion: 1,
    status: "active",
    brief: "Final lifecycle brief",
    phaseIndex: 0,
    approved: [],
    selected: [],
    masters: {},
    modeOwnership: "ai",
    productMode: "ai",
    createdAt: ts,
    updatedAt: ts,
    ...partial,
  };
}

describe("CDF Final lifecycle (framework)", () => {
  let mongod: MongoMemoryServer | undefined;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod?.stop();
  });

  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfArtifactEngineForTests();
    resetCdfRequirementEngineForTests();
  });

  it("A — output approval contract is required", () => {
    const contract = resolveCdfPhaseExecutionContract({
      serviceId: "social-media",
      phaseId: "output",
    });
    assert.ok(contract);
    assert.equal(contract!.artifactKey, "social-media.output");
    assert.equal(contract!.executionStrategy, "canonical");
    assert.equal(contract!.generationModality, "image");
    assert.equal(contract!.approvalRequired, true);
  });

  it("B — approve pins exact approvedArtifacts X@V", () => {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "social-media",
      productMode: "ai",
      organizationId: "org_final",
      projectId: "proj_final",
    });
    assert.equal(started.ok, true);
    if (!started.ok) return;
    let session = started.value.session;
    const briefed = applyCdfTransition({
      action: "submit_brief",
      sessionId: session.sessionId,
      brief: "Create an Instagram Feed Post for Mango Pulse everyday energy.",
      expectedVersion: session.sessionVersion,
    });
    assert.equal(briefed.ok, true);
    if (!briefed.ok) return;
    session = briefed.value.session;

    // Advance through platform + size via select_route cards
    for (const label of ["Instagram", "Feed Post"]) {
      const sel = applyCdfTransition({
        action: "select_route",
        sessionId: session.sessionId,
        routeIndex: 0,
        routeLabel: label,
        expectedVersion: session.sessionVersion,
      });
      assert.equal(sel.ok, true);
      if (!sel.ok) return;
      session = sel.value.session;
    }

    const routes = createArtifact({
      organizationId: "org_final",
      projectId: "proj_final",
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "routes",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      artifactType: "text_choice",
      data: fixtureSocialMediaRoutes() as never,
    });
    markSelected(routes.artifact.artifactId, 1);
    session = upsertSessionArtifactRef(session, {
      artifactId: routes.artifact.artifactId,
      version: 1,
      phaseId: "routes",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      role: "selected",
    });
    saveCdfSession({ ...session, phaseId: "output", phaseIndex: 3 });

    const output = createArtifact({
      organizationId: "org_final",
      projectId: "proj_final",
      sessionId: session.sessionId,
      serviceId: "social-media",
      phaseId: "output",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      artifactType: "image",
      data: fixtureSocialMediaOutput(routes.artifact.artifactId, 1) as never,
      provenance: {
        vaultAssetIds: [SOCIAL_MEDIA_FIXTURE_IDS.vaultImage],
      },
    });
    session = upsertSessionArtifactRef(getSession(session.sessionId), {
      artifactId: output.artifact.artifactId,
      version: 1,
      phaseId: "output",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      role: "generated",
    });
    saveCdfSession(session);

    const approved = applyCdfTransition({
      action: "approve",
      sessionId: session.sessionId,
      expectedVersion: session.sessionVersion,
      artifactId: output.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
    });
    assert.equal(approved.ok, true);
    if (!approved.ok) return;
    const pin = approved.value.session.approvedArtifacts?.find(
      (a) => a.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.output,
    );
    assert.equal(pin?.artifactId, output.artifact.artifactId);
    assert.equal(pin?.version, 1);
    assert.equal(pin?.role, "approved");
    assert.equal(approved.value.session.phaseId, "final");
  });

  it("C/D — Final dependency resolves exact X@V; fails without approved", () => {
    const deps = resolveCdfPhaseDependencies("social-media", "final");
    assert.ok(deps.some((d) => d.phaseId === "output"));
    const outDep = deps.find((d) => d.phaseId === "output")!;
    assert.equal(outDep.requiredRole, "approved");

    const sessionId = `cdf_final_dep_${Date.now().toString(36)}`;
    const routes = createArtifact({
      organizationId: "org_final",
      projectId: "proj_final",
      sessionId,
      serviceId: "social-media",
      phaseId: "routes",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      artifactType: "text_choice",
      data: fixtureSocialMediaRoutes() as never,
    });
    const output = createArtifact({
      organizationId: "org_final",
      projectId: "proj_final",
      sessionId,
      serviceId: "social-media",
      phaseId: "output",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      artifactType: "image",
      data: fixtureSocialMediaOutput(routes.artifact.artifactId, 1) as never,
      provenance: { vaultAssetIds: [SOCIAL_MEDIA_FIXTURE_IDS.vaultImage] },
    });

    let session = saveCdfSession(
      baseSession({
        sessionId,
        serviceId: "social-media",
        phaseId: "final",
        phaseIndex: 4,
      }),
    );
    session = upsertSessionArtifactRef(session, {
      artifactId: output.artifact.artifactId,
      version: 1,
      phaseId: "output",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      role: "generated",
    });
    saveCdfSession(session);

    const genOnly = resolveUpstreamArtifactsForPhase({
      session,
      serviceId: "social-media",
      phaseId: "final",
      organizationId: "org_final",
      projectId: "proj_final",
    });
    assert.equal(genOnly.ok, false);

    session = upsertSessionArtifactRef(session, {
      artifactId: output.artifact.artifactId,
      version: 1,
      phaseId: "output",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      role: "selected",
    });
    saveCdfSession(session);
    const selOnly = resolveUpstreamArtifactsForPhase({
      session,
      serviceId: "social-media",
      phaseId: "final",
      organizationId: "org_final",
      projectId: "proj_final",
    });
    assert.equal(selOnly.ok, false);

    markApproved(output.artifact.artifactId, 1);
    session = upsertSessionArtifactRef(session, {
      artifactId: output.artifact.artifactId,
      version: 1,
      phaseId: "output",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      role: "approved",
    });
    saveCdfSession(session);
    const ok = resolveUpstreamArtifactsForPhase({
      session,
      serviceId: "social-media",
      phaseId: "final",
      organizationId: "org_final",
      projectId: "proj_final",
    });
    assert.equal(ok.ok, true);
    if (!ok.ok) return;
    const up = ok.upstream.find(
      (u) => u.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.output,
    );
    assert.equal(up?.artifactId, output.artifact.artifactId);
    assert.equal(up?.version, 1);
  });

  it("E — Final modality is materialize (not image regenerate)", () => {
    const finalContract = resolveCdfPhaseExecutionContract({
      serviceId: "social-media",
      phaseId: "final",
    });
    assert.ok(finalContract);
    assert.equal(finalContract!.generationModality, "materialize");
    assert.notEqual(finalContract!.generationModality, "image");
    assert.notEqual(finalContract!.executionStrategy, "route_visual");
  });

  it("F — Final resolves after restart with approved pin", async () => {
    const sessionId = `cdf_final_rh_${Date.now().toString(36)}`;
    const routes = createArtifact({
      organizationId: "org_final",
      projectId: "proj_final",
      sessionId,
      serviceId: "social-media",
      phaseId: "routes",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      artifactType: "text_choice",
      data: fixtureSocialMediaRoutes() as never,
    });
    const output = createArtifact({
      organizationId: "org_final",
      projectId: "proj_final",
      sessionId,
      serviceId: "social-media",
      phaseId: "output",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      artifactType: "image",
      data: fixtureSocialMediaOutput(routes.artifact.artifactId, 1) as never,
      provenance: { vaultAssetIds: [SOCIAL_MEDIA_FIXTURE_IDS.vaultImage] },
    });
    markApproved(output.artifact.artifactId, 1);
    let session = saveCdfSession(
      baseSession({
        sessionId,
        serviceId: "social-media",
        phaseId: "final",
        phaseIndex: 4,
        status: "completed",
      }),
    );
    for (const role of ["generated", "approved"] as const) {
      session = upsertSessionArtifactRef(session, {
        artifactId: output.artifact.artifactId,
        version: 1,
        phaseId: "output",
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
        role,
      });
    }
    saveCdfSession(session);
    await persistCdfSession(session);
    await flushCdfArtifactBagToMongo();

    resetCdfSessionsForTests();
    resetCdfArtifactEngineForTests();
    const { ensureCdfArtifactBagLoaded } = await import(
      "../../../src/platform/cdf/artifacts/store"
    );
    await ensureCdfArtifactBagLoaded();
    const reloaded = await ensureCdfSessionLoaded(sessionId);
    assert.ok(reloaded);
    const pin = reloaded!.approvedArtifacts?.find(
      (a) => a.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.output,
    );
    assert.equal(pin?.artifactId, output.artifact.artifactId);
    assert.equal(pin?.version, 1);
    assert.equal(
      getArtifactVersion(output.artifact.artifactId, 1).artifactId,
      output.artifact.artifactId,
    );
  });

  it("G — V1 remains pinned when V2 exists", () => {
    const sessionId = `cdf_final_v1_${Date.now().toString(36)}`;
    const routes = createArtifact({
      organizationId: "org_final",
      projectId: "proj_final",
      sessionId,
      serviceId: "social-media",
      phaseId: "routes",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      artifactType: "text_choice",
      data: fixtureSocialMediaRoutes() as never,
    });
    const output = createArtifact({
      organizationId: "org_final",
      projectId: "proj_final",
      sessionId,
      serviceId: "social-media",
      phaseId: "output",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      artifactType: "image",
      data: fixtureSocialMediaOutput(routes.artifact.artifactId, 1) as never,
      provenance: { vaultAssetIds: [SOCIAL_MEDIA_FIXTURE_IDS.vaultImage] },
    });
    markApproved(output.artifact.artifactId, 1);
    createVersion({
      artifactId: output.artifact.artifactId,
      expectedLatestVersion: 1,
      data: {
        ...fixtureSocialMediaOutput(routes.artifact.artifactId, 1),
        creativeId: "creative_02",
      } as never,
      provenance: { vaultAssetIds: [SOCIAL_MEDIA_FIXTURE_IDS.vaultImage] },
    });
    let session = saveCdfSession(
      baseSession({
        sessionId,
        serviceId: "social-media",
        phaseId: "final",
        phaseIndex: 4,
      }),
    );
    session = upsertSessionArtifactRef(session, {
      artifactId: output.artifact.artifactId,
      version: 1,
      phaseId: "output",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
      role: "approved",
    });
    saveCdfSession(session);
    const ok = resolveUpstreamArtifactsForPhase({
      session,
      serviceId: "social-media",
      phaseId: "final",
      organizationId: "org_final",
      projectId: "proj_final",
    });
    assert.equal(ok.ok, true);
    if (!ok.ok) return;
    const up = ok.upstream.find(
      (u) => u.artifactKey === SOCIAL_MEDIA_ARTIFACT_KEYS.output,
    );
    assert.equal(up?.version, 1);
    assert.equal(getArtifactVersion(output.artifact.artifactId, 2).version, 2);
  });

  it("H — missing output ArtifactVersion fails closed", () => {
    const session = saveCdfSession(
      baseSession({
        sessionId: `cdf_final_miss_${Date.now().toString(36)}`,
        serviceId: "social-media",
        phaseId: "final",
        phaseIndex: 4,
        approvedArtifacts: [
          {
            artifactId: "cdfart_missing_output_ghost",
            version: 1,
            phaseId: "output",
            artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.output,
            role: "approved",
          },
        ],
      }),
    );
    const resolved = resolveUpstreamArtifactsForPhase({
      session,
      serviceId: "social-media",
      phaseId: "final",
      organizationId: "org_final",
      projectId: "proj_final",
    });
    assert.equal(resolved.ok, false);
  });

  it("I — Presentation storyline approval still required for slide-content", () => {
    const deps = resolveCdfPhaseDependencies("presentation", "slide-content");
    const story = deps.find((d) => d.phaseId === "storyline");
    assert.ok(story);
    assert.equal(story!.requiredRole, "approved");
  });

  it("J — Packaging front-pack dependency role remains contract-derived", () => {
    const deps = resolveCdfPhaseDependencies("packaging", "front-pack");
    assert.ok(deps.length >= 1);
    for (const d of deps) {
      assert.ok(
        d.requiredRole === "approved" ||
          d.requiredRole === "selected" ||
          d.requiredRole === "generated",
      );
    }
  });

  it("K — Logo multi-visual uses canonical + model-generation fanout (not route_visual)", () => {
    const c = resolveCdfPhaseExecutionContract({
      serviceId: "logo",
      phaseId: "logo-options",
    });
    assert.ok(c);
    assert.equal(c!.executionStrategy, "canonical");
    assert.equal(c!.allowsRouteVisualFanout, false);
    assert.equal(c!.allowsModelGenerationFanout, true);
    const smFinal = resolveCdfPhaseExecutionContract({
      serviceId: "social-media",
      phaseId: "final",
    });
    assert.notEqual(smFinal?.executionStrategy, "route_visual");
  });

  it("L — no service-specific Final runtime branch in approve identity gate", () => {
    const src = readApproveSource();
    const approveBlock = src.slice(
      src.indexOf('if (req.action === "approve")'),
      src.indexOf('if (req.action === "refine")'),
    );
    // Logging may mention social-media; identity gate must use phaseContract
    assert.match(approveBlock, /resolveCdfPhaseExecutionContract/);
    assert.match(approveBlock, /requiresCanonicalCreate/);
    assert.match(approveBlock, /CDF_CANONICAL_ARTIFACT_MISMATCH|artifactVersion/);
  });
});

function getSession(sessionId: string): CdfSessionState {
  const { getCdfSession } = require("../../../src/platform/cdf") as typeof import("../../../src/platform/cdf");
  const s = getCdfSession(sessionId);
  if (!s) throw new Error(`missing session ${sessionId}`);
  return s;
}
