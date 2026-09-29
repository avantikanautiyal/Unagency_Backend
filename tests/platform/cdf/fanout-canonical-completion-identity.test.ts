/**
 * Fanout leaf canonical completion identity — each intentional leaf must
 * independently complete; leaf B must not idempotently replay leaf A.
 *
 * No paid providers.
 */

import assert from "node:assert/strict";
import { resolveEstablishedCanonicalCompletionAttach } from "../../../src/platform/api/services/execution-cdf-canonical-ingest";
import {
  bindGeneratedArtifactToSession,
  createArtifact,
  fixtureSocialMediaRoutes,
  getCdfSession,
  resetCdfArtifactEngineForTests,
  resetCdfSessionsForTests,
  saveCdfSession,
  SOCIAL_MEDIA_ARTIFACT_KEYS,
  upsertSessionArtifactRef,
} from "../../../src/platform/cdf";
import type { CdfSessionState } from "../../../src/platform/cdf/types";

function sessionStub(sessionId: string, phaseId = "output"): CdfSessionState {
  const ts = new Date().toISOString();
  return {
    sessionId,
    serviceId: "social-media",
    organizationId: "6a8d8d7dc263a4d6afe69691",
    projectId: "proj_fanout_id",
    contractVersion: "2.0.0-m1",
    sessionVersion: 1,
    status: "active",
    brief: "Fanout identity brief",
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

describe("fanout leaf canonical completion identity", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfArtifactEngineForTests();
  });

  it("1/2/4 — leaf B does not resolve leaf A's established completion", () => {
    const sessionId = `cdf_fanout_id_${Date.now().toString(36)}`;
    let session = saveCdfSession(sessionStub(sessionId));
    session = upsertSessionArtifactRef(session, {
      artifactId: "cdfart_leaf_a_social-media-output",
      version: 1,
      phaseId: "output",
      artifactKey: "social-media.output",
      role: "generated",
      generationFanoutGroupId: "fanout_group_1",
      generationFanoutTargetId: "fanout_0_google",
      generationExecutionId: "exec_leaf_a",
    });
    saveCdfSession(session);

    const leafBMeta = {
      cdfSessionId: sessionId,
      cdfPhaseId: "output",
      cdfArtifactKey: "social-media.output",
      generationFanoutLeaf: true as const,
      generationFanoutGroupId: "fanout_group_1",
      generationFanoutTargetId: "fanout_1_ideogram",
    };
    assert.equal(
      resolveEstablishedCanonicalCompletionAttach(leafBMeta),
      null,
      "leaf B must not see leaf A's session pin as established",
    );

    const leafAMeta = {
      cdfSessionId: sessionId,
      cdfPhaseId: "output",
      cdfArtifactKey: "social-media.output",
      generationFanoutLeaf: true as const,
      generationFanoutGroupId: "fanout_group_1",
      generationFanoutTargetId: "fanout_0_google",
    };
    const establishedA = resolveEstablishedCanonicalCompletionAttach(leafAMeta);
    assert.ok(establishedA);
    assert.equal(
      establishedA!.cdfArtifactId,
      "cdfart_leaf_a_social-media-output",
    );
  });

  it("3 — same leaf replay remains idempotent via session pin + bind", () => {
    const sessionId = `cdf_fanout_same_${Date.now().toString(36)}`;
    saveCdfSession(sessionStub(sessionId, "routes"));
    const art = createArtifact({
      organizationId: "6a8d8d7dc263a4d6afe69691",
      projectId: "proj_fanout_id",
      sessionId,
      serviceId: "social-media",
      phaseId: "routes",
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      artifactType: "text_choice",
      data: fixtureSocialMediaRoutes() as never,
    });
    const bound = bindGeneratedArtifactToSession({
      sessionId,
      phaseId: "routes",
      artifactId: art.artifact.artifactId,
      version: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      generationFanoutGroupId: "fanout_group_same",
      generationFanoutTargetId: "fanout_0_openai",
      generationExecutionId: "exec_same_leaf",
    });
    assert.equal(bound.ok, true);

    const replay = bindGeneratedArtifactToSession({
      sessionId,
      phaseId: "routes",
      artifactId: art.artifact.artifactId,
      version: 1,
      artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
      generationFanoutGroupId: "fanout_group_same",
      generationFanoutTargetId: "fanout_0_openai",
      generationExecutionId: "exec_same_leaf",
    });
    assert.equal(replay.ok, true);
    if (replay.ok) assert.equal(replay.idempotentReplay, true);

    const established = resolveEstablishedCanonicalCompletionAttach({
      cdfSessionId: sessionId,
      cdfPhaseId: "routes",
      generationFanoutLeaf: true,
      generationFanoutTargetId: "fanout_0_openai",
    });
    assert.ok(established);
    assert.equal(established!.cdfArtifactId, art.artifact.artifactId);
  });

  it("6 — three fanout leaves keep independent generated pins", () => {
    const sessionId = `cdf_fanout_three_${Date.now().toString(36)}`;
    saveCdfSession(sessionStub(sessionId, "routes"));
    const targets = [
      "fanout_0_openai",
      "fanout_1_google",
      "fanout_2_ideogram",
    ] as const;
    const ids: string[] = [];
    for (const targetId of targets) {
      const art = createArtifact({
        organizationId: "6a8d8d7dc263a4d6afe69691",
        projectId: "proj_fanout_id",
        sessionId,
        serviceId: "social-media",
        phaseId: "routes",
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
        artifactType: "text_choice",
        data: fixtureSocialMediaRoutes() as never,
      });
      ids.push(art.artifact.artifactId);
      const bound = bindGeneratedArtifactToSession({
        sessionId,
        phaseId: "routes",
        artifactId: art.artifact.artifactId,
        version: 1,
        artifactKey: SOCIAL_MEDIA_ARTIFACT_KEYS.routes,
        generationFanoutGroupId: "fanout_group_three",
        generationFanoutTargetId: targetId,
        generationExecutionId: `exec_${targetId}`,
      });
      assert.equal(bound.ok, true);
    }
    const session = getCdfSession(sessionId)!;
    const generated = session.generatedArtifacts ?? [];
    assert.equal(generated.length, 3);
    assert.deepEqual(
      generated.map((g) => g.generationFanoutTargetId).sort(),
      [...targets].sort(),
    );
    assert.deepEqual(
      generated.map((g) => g.artifactId).sort(),
      [...ids].sort(),
    );
  });

  it("10 — non-fanout session+phase idempotency unchanged", () => {
    const sessionId = `cdf_nofanout_${Date.now().toString(36)}`;
    let session = saveCdfSession(sessionStub(sessionId));
    session = upsertSessionArtifactRef(session, {
      artifactId: "cdfart_solo_social-media-output",
      version: 1,
      phaseId: "output",
      artifactKey: "social-media.output",
      role: "generated",
    });
    saveCdfSession(session);

    const established = resolveEstablishedCanonicalCompletionAttach({
      cdfSessionId: sessionId,
      cdfPhaseId: "output",
      cdfArtifactKey: "social-media.output",
    });
    assert.ok(established);
    assert.equal(established!.cdfArtifactId, "cdfart_solo_social-media-output");
  });

  it("11 — hydration: upsert by leaf target preserves both pins", () => {
    const sessionId = `cdf_fanout_hydrate_${Date.now().toString(36)}`;
    let session = saveCdfSession(sessionStub(sessionId));
    session = upsertSessionArtifactRef(session, {
      artifactId: "cdfart_leaf_a",
      version: 1,
      phaseId: "output",
      artifactKey: "social-media.output",
      role: "generated",
      generationFanoutTargetId: "fanout_0_google",
      generationExecutionId: "exec_a",
    });
    session = upsertSessionArtifactRef(session, {
      artifactId: "cdfart_leaf_b",
      version: 1,
      phaseId: "output",
      artifactKey: "social-media.output",
      role: "generated",
      generationFanoutTargetId: "fanout_1_ideogram",
      generationExecutionId: "exec_b",
    });
    assert.equal(session.generatedArtifacts?.length, 2);
    session = upsertSessionArtifactRef(session, {
      artifactId: "cdfart_leaf_a_v2",
      version: 1,
      phaseId: "output",
      artifactKey: "social-media.output",
      role: "generated",
      generationFanoutTargetId: "fanout_0_google",
      generationExecutionId: "exec_a",
    });
    assert.equal(session.generatedArtifacts?.length, 2);
    assert.equal(
      session.generatedArtifacts?.find(
        (g) => g.generationFanoutTargetId === "fanout_0_google",
      )?.artifactId,
      "cdfart_leaf_a_v2",
    );
    assert.equal(
      session.generatedArtifacts?.find(
        (g) => g.generationFanoutTargetId === "fanout_1_ideogram",
      )?.artifactId,
      "cdfart_leaf_b",
    );
  });
});

describe("creative option completion identity", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfArtifactEngineForTests();
  });

  it("sibling option does not replay the first option or an inherited phase stamp", () => {
    const sessionId = `cdf_opt_${Date.now().toString(36)}`;
    const session = saveCdfSession({
      ...sessionStub(sessionId, "adaptations"),
      serviceId: "print-ooh",
      generatedArtifacts: [
        {
          artifactId: "cdfart_option_0_print-ooh-adaptations",
          version: 1,
          phaseId: "adaptations",
          artifactKey: "print-ooh.adaptations",
          role: "generated",
          generationExecutionId: "exec_option_0",
        },
      ],
    });
    assert.ok(session);

    const sibling = {
      cdfSessionId: sessionId,
      cdfPhaseId: "adaptations",
      cdfArtifactKey: "print-ooh.adaptations",
      creativeOptionLeaf: true as const,
      creativeOptionTargetId: "creative_option_1",
      creativeOptionIndex: 1,
      cdfCanonicalCompletionEstablished: true,
      cdfArtifactId: "cdfart_option_0_print-ooh-adaptations",
      cdfArtifactVersion: 1,
    };
    assert.equal(
      resolveEstablishedCanonicalCompletionAttach(sibling, "exec_option_1"),
      null,
    );

    const same = resolveEstablishedCanonicalCompletionAttach(
      {
        ...sibling,
        creativeOptionTargetId: "creative_option_0",
        creativeOptionIndex: 0,
      },
      "exec_option_0",
    );
    assert.ok(same);
    assert.equal(
      same!.cdfArtifactId,
      "cdfart_option_0_print-ooh-adaptations",
    );
  });
});
