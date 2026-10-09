/**
 * C5 + C6 fanout identity regressions.
 *
 * C5: preferredModelId drop must not collapse dual-OpenAI leaves.
 * C6: missing/wrong/duplicate fanout targetId must fail closed.
 */

import assert from "node:assert/strict";
import { ImageExecutionRouter } from "../../../src/platform/providers/image/routing/image-execution-router";
import type { IProviderRuntimeRegistry } from "../../../src/platform/providers/runtime/registry/in-memory-provider-runtime-registry";
import {
  GENERATION_FANOUT_PROVIDER_FAMILIES,
  buildGenerationFanoutLeafMetadata,
  planImageGenerationFanout,
} from "../../../src/platform/generation/generation-fanout";
import { applyArtifactEngineOnApprove } from "../../../src/platform/cdf/artifacts/session-adapter";
import {
  bindGeneratedArtifactToSession,
  createArtifact,
  getCdfSession,
  resetCdfArtifactEngineForTests,
  resetCdfSessionsForTests,
  saveCdfSession,
  upsertSessionArtifactRef,
} from "../../../src/platform/cdf";
import { PACKAGING_ARTIFACT_KEYS } from "../../../src/platform/cdf/artifacts/packaging/keys";
import { fixturePackaging3dDirection } from "../../../src/platform/cdf/artifacts/packaging/fixtures";
import { resolvePhaseCompletionForApproval } from "../../../src/platform/cdf/lifecycle/phase-completion";
import type { CdfSessionState } from "../../../src/platform/cdf/types";
import type { CreateExecutionRequest } from "../../../src/platform/api/contracts";
import { resolveClientRoutingPin } from "../../../src/platform/api/services/execution-create-prepass";
import { resolveEstablishedCanonicalCompletionAttach } from "../../../src/platform/api/services/execution-cdf-canonical-ingest";

function mockRegistry(providerIds: string[]): IProviderRuntimeRegistry {
  return {
    listAvailableProviderIds: () => providerIds,
    resolveAvailable: (id: string) =>
      providerIds.includes(String(id))
        ? { capabilities: ["image.generate"] }
        : undefined,
  } as unknown as IProviderRuntimeRegistry;
}

function sessionStub(sessionId: string): CdfSessionState {
  const ts = new Date().toISOString();
  return {
    sessionId,
    serviceId: "packaging",
    organizationId: "6a8d8d7dc263a4d6afe69691",
    projectId: "proj_c5c6",
    contractVersion: "2.0.0-m1",
    sessionVersion: 1,
    status: "active",
    brief: "C5/C6 identity brief",
    phaseIndex: 2,
    phaseId: "3d-direction",
    approved: [],
    selected: [],
    masters: {},
    modeOwnership: "ai",
    productMode: "ai",
    createdAt: ts,
    updatedAt: ts,
  };
}

describe("C5 — dual-OpenAI leaf identity when preferredModelId dropped", () => {
  it("resolveClientRoutingPin restores model from requestedModel", () => {
    const plan = planImageGenerationFanout({
      useCase: "marketing_creative",
      groupId: "g_c5_pin",
      executableProviderIds: new Set(GENERATION_FANOUT_PROVIDER_FAMILIES),
    });
    const leafC = plan.targets[2]!;
    assert.equal(leafC.providerId, "provider.openai");
    const meta = {
      ...buildGenerationFanoutLeafMetadata({ plan, target: leafC }),
    } as Record<string, unknown>;
    delete meta.preferredModelId;
    delete meta.modelId;
    assert.equal(meta.requestedModel, leafC.modelId);

    const pin = resolveClientRoutingPin({} as CreateExecutionRequest, meta);
    assert.equal(pin.providerId, "provider.openai");
    assert.equal(pin.modelId, leafC.modelId);
    assert.notEqual(pin.modelId, plan.targets[0]!.modelId);
  });

  it("image router refuses provider-only pin (no matrix first-match collapse)", () => {
    const router = new ImageExecutionRouter(
      mockRegistry(["provider.openai", "provider.google"]),
    );
    const collapsed = router.resolve({
      prompt: "logo option",
      capabilityId: "image.generate",
      preferredProviderId: "provider.openai",
      // preferredModelId intentionally omitted
    });
    assert.equal(collapsed.ok, false);
    if (collapsed.ok) return;
    assert.match(String(collapsed.error.message), /preferredModelId is required/i);
  });

  it("after preferredModelId drop + requestedModel restore, all 3 leaves stay distinct", () => {
    const plan = planImageGenerationFanout({
      useCase: "marketing_creative",
      groupId: "g_c5_three",
      executableProviderIds: new Set(GENERATION_FANOUT_PROVIDER_FAMILIES),
    });
    assert.equal(plan.targets.length, 3);
    const router = new ImageExecutionRouter(
      mockRegistry(["provider.openai", "provider.google"]),
    );

    const resolved = plan.targets.map((target) => {
      const meta = {
        ...buildGenerationFanoutLeafMetadata({ plan, target }),
      } as Record<string, unknown>;
      // Simulate prepass dropping preferredModelId while leaving requested*.
      delete meta.preferredModelId;
      const pin = resolveClientRoutingPin({} as CreateExecutionRequest, meta);
      const routed = router.resolve({
        prompt: "fanout leaf",
        capabilityId: "image.generate",
        preferredProviderId: pin.providerId,
        preferredModelId: pin.modelId,
      });
      assert.equal(routed.ok, true);
      if (!routed.ok) throw new Error("expected route ok");
      return {
        targetId: target.targetId,
        requestedModel: String(meta.requestedModel),
        resolvedProvider: routed.value.providerId,
        resolvedModel: routed.value.modelId,
      };
    });

    assert.equal(new Set(resolved.map((r) => r.targetId)).size, 3);
    assert.equal(
      new Set(resolved.map((r) => `${r.resolvedProvider}::${r.resolvedModel}`))
        .size,
      3,
    );
    assert.notEqual(resolved[0]!.resolvedModel, resolved[1]!.resolvedModel);
    assert.equal(resolved[0]!.resolvedProvider, "provider.google");
    assert.equal(resolved[1]!.resolvedProvider, "provider.google");
    assert.equal(resolved[2]!.resolvedProvider, "provider.openai");
  });
});

describe("C6 — fail-closed fanout identity", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfArtifactEngineForTests();
  });

  it("missing targetId — bind refuses (no first-artifact fallback)", () => {
    const sessionId = `cdf_c6_miss_${Date.now().toString(36)}`;
    saveCdfSession(sessionStub(sessionId));
    const art = createArtifact({
      organizationId: "6a8d8d7dc263a4d6afe69691",
      projectId: "proj_c5c6",
      sessionId,
      serviceId: "packaging",
      phaseId: "3d-direction",
      artifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
      artifactType: "pack",
      data: fixturePackaging3dDirection() as never,
    });
    const bound = bindGeneratedArtifactToSession({
      sessionId,
      phaseId: "3d-direction",
      artifactId: art.artifact.artifactId,
      version: 1,
      artifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
      generationFanoutGroupId: "fanout_g_miss",
      generationFanoutLeaf: true,
      // generationFanoutTargetId intentionally omitted
    });
    assert.equal(bound.ok, false);
    if (bound.ok) return;
    assert.equal(bound.code, "FANOUT_TARGET_ID_REQUIRED");
    assert.equal(getCdfSession(sessionId)!.generatedArtifacts?.length ?? 0, 0);
  });

  it("duplicate targetId — second sibling refused", () => {
    const sessionId = `cdf_c6_dup_${Date.now().toString(36)}`;
    saveCdfSession(sessionStub(sessionId));
    const a = createArtifact({
      organizationId: "6a8d8d7dc263a4d6afe69691",
      projectId: "proj_c5c6",
      sessionId,
      serviceId: "packaging",
      phaseId: "3d-direction",
      artifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
      artifactType: "pack",
      data: fixturePackaging3dDirection() as never,
    });
    const b = createArtifact({
      organizationId: "6a8d8d7dc263a4d6afe69691",
      projectId: "proj_c5c6",
      sessionId,
      serviceId: "packaging",
      phaseId: "3d-direction",
      artifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
      artifactType: "pack",
      data: fixturePackaging3dDirection() as never,
    });
    assert.equal(
      bindGeneratedArtifactToSession({
        sessionId,
        phaseId: "3d-direction",
        artifactId: a.artifact.artifactId,
        version: 1,
        artifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
        generationFanoutGroupId: "g",
        generationFanoutTargetId: "fanout_0_openai",
        generationExecutionId: "exec_a",
      }).ok,
      true,
    );
    const dup = bindGeneratedArtifactToSession({
      sessionId,
      phaseId: "3d-direction",
      artifactId: b.artifact.artifactId,
      version: 1,
      artifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
      generationFanoutGroupId: "g",
      generationFanoutTargetId: "fanout_0_openai",
      generationExecutionId: "exec_b",
    });
    assert.equal(dup.ok, false);
    if (dup.ok) return;
    assert.equal(dup.code, "FANOUT_TARGET_ID_DUPLICATE");
  });

  it("wrong targetId / sibling artifact cannot satisfy another leaf", () => {
    const sessionId = `cdf_c6_sib_${Date.now().toString(36)}`;
    let session = saveCdfSession(sessionStub(sessionId));
    const leafA = "fanout_0_openai";
    const leafB = "fanout_1_google";
    const arts: string[] = [];
    for (const targetId of [leafA, leafB]) {
      const art = createArtifact({
        organizationId: "6a8d8d7dc263a4d6afe69691",
        projectId: "proj_c5c6",
        sessionId,
        serviceId: "packaging",
        phaseId: "3d-direction",
        artifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
        artifactType: "pack",
        data: fixturePackaging3dDirection() as never,
      });
      arts.push(art.artifact.artifactId);
      assert.equal(
        bindGeneratedArtifactToSession({
          sessionId,
          phaseId: "3d-direction",
          artifactId: art.artifact.artifactId,
          version: 1,
          artifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
          generationFanoutGroupId: "g_sib",
          generationFanoutTargetId: targetId,
          generationExecutionId: `exec_${targetId}`,
        }).ok,
        true,
      );
    }
    session = getCdfSession(sessionId)!;

    // Leaf B meta must not resolve leaf A's established completion.
    assert.equal(
      resolveEstablishedCanonicalCompletionAttach({
        cdfSessionId: sessionId,
        cdfPhaseId: "3d-direction",
        cdfArtifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
        generationFanoutLeaf: true,
        generationFanoutTargetId: leafB,
      })?.cdfArtifactId,
      arts[1],
    );
    assert.equal(
      resolveEstablishedCanonicalCompletionAttach({
        cdfSessionId: sessionId,
        cdfPhaseId: "3d-direction",
        cdfArtifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
        generationFanoutLeaf: true,
        // missing targetId
      }),
      null,
    );

    // Approve leaf A X@V while claiming leaf B target — fail closed.
    const wrong = resolvePhaseCompletionForApproval({
      session,
      phaseId: "3d-direction",
      serviceId: "packaging",
      requestArtifactId: arts[0]!,
      requestArtifactVersion: 1,
      requestArtifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
      requestGenerationFanoutTargetId: leafB,
    });
    assert.equal(wrong.transitionAllowed, false);

    // Approve without any fanout target when pins exist — fail closed.
    const missing = resolvePhaseCompletionForApproval({
      session,
      phaseId: "3d-direction",
      serviceId: "packaging",
      requestArtifactId: arts[1]!,
      requestArtifactVersion: 1,
      requestArtifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
    });
    assert.equal(missing.transitionAllowed, false);
    assert.equal(missing.failureCode, "CDF_FANOUT_TARGET_ID_REQUIRED");

    // Exact leaf B approval succeeds.
    const ok = resolvePhaseCompletionForApproval({
      session,
      phaseId: "3d-direction",
      serviceId: "packaging",
      requestArtifactId: arts[1]!,
      requestArtifactVersion: 1,
      requestArtifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
      requestGenerationFanoutTargetId: leafB,
    });
    assert.equal(ok.transitionAllowed, true);
    assert.equal(ok.requiredArtifactId, arts[1]);
  });

  it("reload after 3 leaves — session pins preserve distinct targetIds + X@V", () => {
    const sessionId = `cdf_c6_reload_${Date.now().toString(36)}`;
    saveCdfSession(sessionStub(sessionId));
    const targets = [
      "fanout_0_openai",
      "fanout_1_google",
      "fanout_2_openai",
    ] as const;
    const ids: string[] = [];
    for (const targetId of targets) {
      const art = createArtifact({
        organizationId: "6a8d8d7dc263a4d6afe69691",
        projectId: "proj_c5c6",
        sessionId,
        serviceId: "packaging",
        phaseId: "3d-direction",
        artifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
        artifactType: "pack",
        data: fixturePackaging3dDirection() as never,
      });
      ids.push(art.artifact.artifactId);
      assert.equal(
        bindGeneratedArtifactToSession({
          sessionId,
          phaseId: "3d-direction",
          artifactId: art.artifact.artifactId,
          version: 1,
          artifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
          generationFanoutGroupId: "g_reload",
          generationFanoutTargetId: targetId,
          generationExecutionId: `exec_${targetId}`,
        }).ok,
        true,
      );
    }

    // Simulate reload: re-read session and upsert same pins (hydrate).
    let session = getCdfSession(sessionId)!;
    for (let i = 0; i < targets.length; i++) {
      session = upsertSessionArtifactRef(session, {
        artifactId: ids[i]!,
        version: 1,
        phaseId: "3d-direction",
        artifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
        role: "generated",
        generationFanoutGroupId: "g_reload",
        generationFanoutTargetId: targets[i],
        generationExecutionId: `exec_${targets[i]}`,
      });
    }
    saveCdfSession(session);
    const reloaded = getCdfSession(sessionId)!;
    const pins = (reloaded.generatedArtifacts ?? []).filter(
      (r) => r.artifactKey === PACKAGING_ARTIFACT_KEYS.threeDDirection,
    );
    assert.equal(pins.length, 3);
    assert.equal(new Set(pins.map((p) => p.generationFanoutTargetId)).size, 3);
    assert.equal(new Set(pins.map((p) => p.artifactId)).size, 3);
  });

  it("approve persists generationFanoutTargetId on approvedArtifacts (authoritative)", () => {
    resetCdfArtifactEngineForTests();
    resetCdfSessionsForTests();
    const sessionId = `cdf_c6_approve_stamp_${Date.now().toString(36)}`;
    saveCdfSession(sessionStub(sessionId));
    const art = createArtifact({
      organizationId: "6a8d8d7dc263a4d6afe69691",
      projectId: "proj_c5c6",
      sessionId,
      serviceId: "packaging",
      phaseId: "3d-direction",
      artifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
      artifactType: "pack",
      data: fixturePackaging3dDirection() as never,
    });
    assert.equal(
      bindGeneratedArtifactToSession({
        sessionId,
        phaseId: "3d-direction",
        artifactId: art.artifact.artifactId,
        version: 1,
        artifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
        generationFanoutGroupId: "g_stamp",
        generationFanoutTargetId: "fanout_1_google",
        generationExecutionId: "exec_fanout_1_google",
      }).ok,
      true,
    );

    let session = getCdfSession(sessionId)!;
    session = applyArtifactEngineOnApprove({
      session,
      phaseId: "3d-direction",
      artifactId: art.artifact.artifactId,
      artifactVersion: 1,
      artifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
      generationFanoutTargetId: "fanout_1_google",
      generationFanoutGroupId: "g_stamp",
      generationExecutionId: "exec_fanout_1_google",
    });
    saveCdfSession(session);

    const approved = (getCdfSession(sessionId)!.approvedArtifacts ?? []).find(
      (r) => r.artifactKey === PACKAGING_ARTIFACT_KEYS.threeDDirection,
    );
    assert.ok(approved);
    assert.equal(approved!.artifactId, art.artifact.artifactId);
    assert.equal(approved!.version, 1);
    assert.equal(approved!.generationFanoutTargetId, "fanout_1_google");
    assert.equal(approved!.generationExecutionId, "exec_fanout_1_google");
  });
});
