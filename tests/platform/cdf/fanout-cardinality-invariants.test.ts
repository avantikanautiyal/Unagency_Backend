/**
 * Framework fanout cardinality invariants (generic — no service/phase hacks).
 *
 * Seals: declared N=3 leaves, partial success, unavailable topology preserve,
 * quantity≠fanout, intra-leaf-only reference remapping, packaging pin identity,
 * exact leaf selection / ArtifactVersion uniqueness.
 */

import assert from "node:assert/strict";
import { resolveReferenceCapableImageRouting } from "../../../src/platform/api/services/apply-visual-modification-prepass";
import {
  GENERATION_FANOUT_PROVIDER_FAMILIES,
  buildGenerationFanoutLeafMetadata,
  executableFanoutTargets,
  planImageGenerationFanout,
  resolveGenerationFanoutContract,
  resolveIntraLeafFailoverChain,
} from "../../../src/platform/generation/generation-fanout";
import {
  bindGeneratedArtifactToSession,
  createArtifact,
  getCdfSession,
  resetCdfArtifactEngineForTests,
  resetCdfSessionsForTests,
  saveCdfSession,
} from "../../../src/platform/cdf";
import { PACKAGING_ARTIFACT_KEYS } from "../../../src/platform/cdf/artifacts/packaging/keys";
import { fixturePackaging3dDirection } from "../../../src/platform/cdf/artifacts/packaging/fixtures";
import { resolvePhaseCompletionForApproval } from "../../../src/platform/cdf/lifecycle/phase-completion";
import type { CdfSessionState } from "../../../src/platform/cdf/types";
import { GOOGLE_IMAGEN_SPEC } from "../../../src/platform/providers/image/configs/verified-image-provider-specs";

function packagingSession(sessionId: string): CdfSessionState {
  const ts = new Date().toISOString();
  return {
    sessionId,
    serviceId: "packaging",
    organizationId: "6a8d8d7dc263a4d6afe69691",
    projectId: "proj_fanout_card",
    contractVersion: "2.0.0-m1",
    sessionVersion: 1,
    status: "active",
    brief: "Fanout cardinality brief",
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

describe("fanout cardinality invariants (framework)", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfArtifactEngineForTests();
  });

  it("3/3 — declared families produce exactly 3 independent leaves", () => {
    const plan = planImageGenerationFanout({
      useCase: "marketing_creative",
      groupId: "g_333",
      executableProviderIds: new Set(GENERATION_FANOUT_PROVIDER_FAMILIES),
    });
    assert.equal(plan.cardinality, 3);
    assert.equal(plan.targets.length, 3);
    const ids = new Set(plan.targets.map((t) => t.targetId));
    assert.equal(ids.size, 3);
    const metas = plan.targets.map((t) =>
      buildGenerationFanoutLeafMetadata({ plan, target: t }),
    );
    const leafIds = new Set(metas.map((m) => m.generationFanoutTargetId));
    assert.equal(leafIds.size, 3);
    assert.equal(
      metas.every((m) => m.generationFanoutLeaf === true),
      true,
    );
  });

  it("2/3 — one unavailable leaf keeps declared cardinality 3", () => {
    const plan = resolveGenerationFanoutContract({
      useCase: "marketing_creative",
      groupId: "g_23",
      executableProviderIds: new Set(["provider.openai"]),
    });
    assert.equal(plan.cardinality, 3);
    assert.equal(plan.targets.length, 3);
    const exec = executableFanoutTargets(plan);
    assert.ok(exec.length < 3);
    assert.ok(exec.length >= 1);
    const unavailable = plan.targets.filter(
      (t) => t.availability === "unavailable" || t.availability === "unsupported",
    );
    assert.ok(unavailable.length >= 1);
  });

  it("1/3 — single executable provider still declares 3 targets", () => {
    const plan = resolveGenerationFanoutContract({
      useCase: "marketing_creative",
      groupId: "g_13",
      executableProviderIds: new Set(["provider.google"]),
    });
    assert.equal(plan.cardinality, 3);
    assert.equal(plan.targets.length, 3);
  });

  it("unavailable provider → typed leaf availability, topology not shrunk", () => {
    const plan = resolveGenerationFanoutContract({
      useCase: "marketing_creative",
      groupId: "g_unavail",
      executableProviderIds: new Set(["provider.openai", "provider.google"]),
    });
    assert.equal(plan.targets.length, GENERATION_FANOUT_PROVIDER_FAMILIES.length);
    for (const t of plan.targets) {
      assert.ok(
        t.availability === "selected" ||
          t.availability === "available" ||
          t.availability === "unavailable" ||
          t.availability === "unsupported",
      );
    }
  });

  it("intra-leaf failover never lists sibling fanout providers", () => {
    const plan = planImageGenerationFanout({
      useCase: "marketing_creative",
      groupId: "g_intra",
      executableProviderIds: new Set(GENERATION_FANOUT_PROVIDER_FAMILIES),
    });
    const openaiLeaf = plan.targets.find((t) => t.providerId === "provider.openai")!;
    const chain = resolveIntraLeafFailoverChain({
      primaryProviderId: openaiLeaf.providerId,
      primaryModelId: openaiLeaf.modelId,
      matrixChain: plan.targets.map((t) => ({
        providerId: t.providerId,
        modelId: t.modelId,
      })),
    });
    assert.equal(
      chain.every((c) => c.providerId === openaiLeaf.providerId),
      true,
    );
    assert.equal(
      chain.some((c) => c.providerId === "provider.google"),
      false,
    );
  });

  it("no cross-leaf reference remapping for fanout leaves", () => {
    const crossLeaf = resolveReferenceCapableImageRouting({
      metadata: {
        generationFanoutLeaf: true,
        generationFanoutTargetId: "fanout_0_unknown",
        disableCrossProviderFailover: true,
        brandLogoAssetId: "asset_logo_1",
      },
      routedProviderId: "provider.unknown_no_ref",
      routedModelId: "model_a",
      failoverChain: [
        {
          providerId: GOOGLE_IMAGEN_SPEC.canonicalProviderId,
          modelId: GOOGLE_IMAGEN_SPEC.inventoryModelId,
        },
      ],
    });
    assert.equal(crossLeaf.ok, false, "fanout leaf must not remapped to sibling family");
  });

  it("non-fanout may still remapped to reference-capable provider", () => {
    const remapped = resolveReferenceCapableImageRouting({
      metadata: {
        brandLogoAssetId: "asset_logo_1",
        visualOperationKind: "MODIFY",
        targetArtifactId: "art_x",
      },
      routedProviderId: "provider.unknown_no_ref",
      routedModelId: "model_a",
      failoverChain: [
        {
          providerId: GOOGLE_IMAGEN_SPEC.canonicalProviderId,
          modelId: GOOGLE_IMAGEN_SPEC.inventoryModelId,
        },
      ],
    });
    assert.equal(remapped.ok, true);
    if (!remapped.ok) return;
    assert.equal(remapped.value.providerId, GOOGLE_IMAGEN_SPEC.canonicalProviderId);
    assert.equal(remapped.value.fallbackUsed, true);
  });

  it("quantity=1 cannot collapse declared fanout=3 (API surface)", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const src = fs.readFileSync(
      path.join(
        __dirname,
        "../../../src/platform/generation/generation-fanout.ts",
      ),
      "utf8",
    );
    const planFn = src.slice(src.indexOf("export function planImageGenerationFanout"));
    assert.doesNotMatch(planFn.slice(0, 400), /\bquantity\b/);
    assert.doesNotMatch(planFn.slice(0, 400), /\boutputMode\b/);
    const plan = planImageGenerationFanout({
      useCase: "marketing_creative",
      groupId: "g_qty",
      executableProviderIds: new Set(GENERATION_FANOUT_PROVIDER_FAMILIES),
    });
    assert.equal(plan.cardinality, 3);
  });

  it("packaging bind — 3 fanout leaves keep independent pins (restart identity)", () => {
    const sessionId = `cdf_pkg_fanout_${Date.now().toString(36)}`;
    saveCdfSession(packagingSession(sessionId));
    const targets = [
      "fanout_0_openai",
      "fanout_1_google",
      "fanout_2_openai",
    ] as const;
    const artifactIds: string[] = [];
    for (const targetId of targets) {
      const art = createArtifact({
        organizationId: "6a8d8d7dc263a4d6afe69691",
        projectId: "proj_fanout_card",
        sessionId,
        serviceId: "packaging",
        phaseId: "3d-direction",
        artifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
        artifactType: "pack",
        data: fixturePackaging3dDirection() as never,
      });
      artifactIds.push(art.artifact.artifactId);
      const bound = bindGeneratedArtifactToSession({
        sessionId,
        phaseId: "3d-direction",
        artifactId: art.artifact.artifactId,
        version: 1,
        artifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
        generationFanoutGroupId: "fanout_pkg_g1",
        generationFanoutTargetId: targetId,
        generationExecutionId: `exec_${targetId}`,
      });
      assert.equal(bound.ok, true);
    }
    const session = getCdfSession(sessionId)!;
    const pins = (session.generatedArtifacts ?? []).filter(
      (r) => r.artifactKey === PACKAGING_ARTIFACT_KEYS.threeDDirection,
    );
    assert.equal(pins.length, 3);
    assert.equal(
      new Set(pins.map((p) => p.generationFanoutTargetId)).size,
      3,
    );
    assert.equal(new Set(pins.map((p) => p.artifactId)).size, 3);
    assert.deepEqual(
      pins.map((p) => p.artifactId).sort(),
      [...artifactIds].sort(),
    );
  });

  it("canonical ArtifactVersion uniqueness + exact leaf approval", () => {
    const sessionId = `cdf_approve_leaf_${Date.now().toString(36)}`;
    saveCdfSession(packagingSession(sessionId));
    const leafA = "fanout_0_openai";
    const leafB = "fanout_1_google";
    const arts: string[] = [];
    for (const targetId of [leafA, leafB]) {
      const art = createArtifact({
        organizationId: "6a8d8d7dc263a4d6afe69691",
        projectId: "proj_fanout_card",
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
          generationFanoutGroupId: "fanout_approve_g",
          generationFanoutTargetId: targetId,
          generationExecutionId: `exec_${targetId}`,
        }).ok,
        true,
      );
    }
    assert.notEqual(arts[0], arts[1]);

    const session = getCdfSession(sessionId)!;
    const approveB = resolvePhaseCompletionForApproval({
      session,
      phaseId: "3d-direction",
      serviceId: "packaging",
      requestArtifactId: arts[1]!,
      requestArtifactVersion: 1,
      requestArtifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
      requestGenerationFanoutTargetId: leafB,
    });
    assert.equal(approveB.transitionAllowed, true);
    assert.equal(approveB.requiredArtifactId, arts[1]);
    assert.equal(approveB.requiredArtifactVersion, 1);

    const wrongLeaf = resolvePhaseCompletionForApproval({
      session,
      phaseId: "3d-direction",
      serviceId: "packaging",
      requestArtifactId: arts[0]!,
      requestArtifactVersion: 1,
      requestArtifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
      requestGenerationFanoutTargetId: leafB,
    });
    assert.equal(wrongLeaf.transitionAllowed, false);
  });
});
