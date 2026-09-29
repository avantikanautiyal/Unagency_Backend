/**
 * Regression: Video & Motion → Animation execution create must not throw
 * ReferenceError on isGenerationFanoutLeafMetadata.
 *
 * Fanout metadata is identity-only (leaf pin / failover isolation).
 * It must not drive composition hard/soft, provider, service, or phase branches.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  applyCdfTransition,
  applyUpstreamVisualArtifactHandoff,
  createArtifact,
  getCdfSession,
  markApproved,
  markValidated,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  saveCdfSession,
  upsertSessionArtifactRef,
} from "../../../src/platform/cdf";
import { createMemoryVaultAssetResolver } from "../../../src/platform/cdf/rendering";
import {
  resetDefaultVaultAssetResolverForTests,
  setDefaultVaultAssetResolver,
} from "../../../src/platform/cdf/rendering/default-vault-asset-resolver";
import { runCreatePrepass } from "../../../src/platform/api/services/execution-create-prepass";
import type { ExecutionCreateHost } from "../../../src/platform/api/services/execution-create-host";
import type { AuthPrincipal } from "../../../src/platform/api/contracts";
import { success } from "../../../src/platform/core/result";
import {
  buildGenerationFanoutLeafMetadata,
  isGenerationFanoutLeafMetadata,
  planVideoGenerationFanout,
} from "../../../src/platform/generation/generation-fanout";
import { resolveGeneratedDeliverablePresentationEligibility } from "../../../../Unagency-frontend/packages/api/src/domain/cdf/generated-deliverable-presentation-eligibility";

const VAULT_ID = "507f1f77bcf86cd7994390aa";
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const principal = {
  userId: "user_anim_fanout",
  organizationId: "org_anim_fanout",
} as AuthPrincipal;

function stubVideoHost(): ExecutionCreateHost {
  return {
    deps: {
      nowIso: () => new Date().toISOString(),
      clockMs: () => Date.now(),
      createId: (p: string) => `${p}_anim_fanout`,
      videoRouter: {
        resolve: async (input: {
          preferredProviderId?: string;
          preferredModelId?: string;
        }) => {
          // Mirror LIVE matrix: Kling paused — prefer Luma unless an executable pin.
          const preferred = input.preferredProviderId?.trim();
          if (preferred === "provider.luma") {
            return success({
              providerId: "provider.luma",
              modelId: input.preferredModelId?.trim() || "luma-ray-2",
              routingDecisionId: "route_anim_test",
              capabilityId: "video.generate",
              failoverChain: [],
            });
          }
          if (preferred === "provider.minimax") {
            return success({
              providerId: "provider.minimax",
              modelId: input.preferredModelId?.trim() || "hailuo-ai",
              routingDecisionId: "route_anim_test",
              capabilityId: "video.generate",
              failoverChain: [],
            });
          }
          return success({
            providerId: "provider.luma",
            modelId: "luma-ray-2",
            routingDecisionId: "route_anim_test",
            capabilityId: "video.generate",
            failoverChain: [
              { providerId: "provider.minimax", modelId: "hailuo-ai" },
            ],
          });
        },
      },
    },
  } as unknown as ExecutionCreateHost;
}

function readPrepassSource(): string {
  return fs.readFileSync(
    path.join(
      __dirname,
      "../../../src/platform/api/services/execution-create-prepass.ts",
    ),
    "utf8",
  );
}

function readIngestSource(): string {
  return fs.readFileSync(
    path.join(
      __dirname,
      "../../../src/platform/api/services/execution-cdf-canonical-ingest.ts",
    ),
    "utf8",
  );
}

describe("video animation fanout leaf metadata (ReferenceError regression)", () => {
  beforeEach(() => {
    resetCdfSessionsForTests();
    resetCdfRequirementEngineForTests();
    resetCdfArtifactEngineForTests();
    resetDefaultVaultAssetResolverForTests();
    setDefaultVaultAssetResolver(
      createMemoryVaultAssetResolver({ [VAULT_ID]: TINY_PNG }),
    );
  });

  afterEach(() => {
    resetDefaultVaultAssetResolverForTests();
  });

  it("1 — animation video.generate prepass does not throw ReferenceError", async () => {
    const result = await runCreatePrepass(
      stubVideoHost(),
      {
        prompt: "Animate approved storyboard into 3D motion",
        organizationId: "org_anim_fanout",
        capabilityId: "video.generate",
        metadata: {
          cdfServiceId: "videos",
          cdfPhaseId: "animation",
          cdfArtifactKey: "videos.animation",
          cdfGenerationModality: "video",
          service: "video",
          subtype: "3d-animation",
          cdfSkipHeavyPrepass: true,
        },
      },
      principal,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.kind, "continue");
    if (result.value.kind !== "continue") return;
    const meta = result.value.state.workingMetadata ?? {};
    // Kling is paused (no credits) — matrix picks next LIVE engine (Luma).
    assert.equal(meta.preferredProviderId, "provider.luma");
    assert.equal(meta.preferredModelId, "luma-ray-2");
    assert.equal(isGenerationFanoutLeafMetadata(meta), false);
    assert.equal(meta.generationFanoutTargetId, undefined);
  });

  it("2 — fanout leaf carries exact generationFanoutTargetId when present", async () => {
    const plan = planVideoGenerationFanout({
      useCase: "cinematic",
      groupId: "fanout_anim_1",
    });
    assert.ok(plan.targets.length >= 1);
    // Prefer an executable leaf for prepass pin (Kling slot is paused/unavailable).
    const target =
      plan.targets.find((t) => t.availability === "selected") ?? plan.targets[0]!;
    const leaf = buildGenerationFanoutLeafMetadata({ plan, target });
    assert.equal(isGenerationFanoutLeafMetadata(leaf), true);
    assert.equal(leaf.generationFanoutTargetId, target.targetId);
    assert.equal(leaf.generationFanoutLeaf, true);

    const result = await runCreatePrepass(
      stubVideoHost(),
      {
        prompt: "Animate leaf",
        organizationId: "org_anim_fanout",
        capabilityId: "video.generate",
        metadata: {
          ...leaf,
          cdfServiceId: "videos",
          cdfPhaseId: "animation",
          cdfArtifactKey: "videos.animation",
          cdfGenerationModality: "video",
          cdfSkipHeavyPrepass: true,
        },
      },
      principal,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.kind, "continue");
    if (result.value.kind !== "continue") return;
    const meta = result.value.state.workingMetadata ?? {};
    assert.equal(meta.generationFanoutTargetId, target.targetId);
    assert.equal(meta.generationFanoutLeaf, true);
    assert.equal(meta.disableCrossProviderFailover, true);
    assert.equal(isGenerationFanoutLeafMetadata(meta), true);
  });

  it("3 — non-fanout animation execution works without fanout metadata", async () => {
    const result = await runCreatePrepass(
      stubVideoHost(),
      {
        prompt: "Non-fanout animation",
        organizationId: "org_anim_fanout",
        capabilityId: "video.generate",
        metadata: {
          cdfServiceId: "videos",
          cdfPhaseId: "animation",
          cdfArtifactKey: "videos.animation",
          cdfSkipHeavyPrepass: true,
        },
      },
      principal,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.kind, "continue");
    if (result.value.kind !== "continue") return;
    const meta = result.value.state.workingMetadata ?? {};
    assert.equal(meta.generationFanoutLeaf, undefined);
    assert.equal(meta.generationFanoutTargetId, undefined);
    assert.notEqual(meta.disableCrossProviderFailover, true);
  });

  it("4 — fanout metadata does not affect composition hard/soft classification", () => {
    const base = {
      executionId: "exec_comp",
      executionStatus: "succeeded" as const,
      requiresCanonicalCompletion: true,
      cdfCanonicalCompletionEstablished: true,
      cdfArtifactId: "cdfart_comp_1",
      cdfArtifactVersion: 1,
      structuralStatus: "NON_COMPLIANT" as const,
      compositionOutcome: "COMPOSITION_FAILED" as const,
    };
    const withoutFanout = resolveGeneratedDeliverablePresentationEligibility(base);
    const withFanout = resolveGeneratedDeliverablePresentationEligibility({
      ...base,
      generationFanoutLeaf: true,
      generationFanoutTargetId: "fanout_0_kling",
    } as never);
    assert.equal(withoutFanout.status, "AVAILABLE_WITH_WARNINGS");
    assert.equal(withFanout.status, withoutFanout.status);

    const ingest = readIngestSource();
    // Composition exception path must not reintroduce fanout-gated hard failure.
    assert.doesNotMatch(
      ingest,
      /catch\s*\([^)]*\)[\s\S]{0,800}isFanoutLeaf(?!Meta)/,
    );
    assert.doesNotMatch(
      ingest,
      /canonicalImageBridgeFailure[\s\S]{0,200}isGenerationFanoutLeafMetadata/,
    );
  });

  it("5 — exact storyboard X@1 reaches animation handoff", async () => {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "videos",
      productMode: "ai",
      organizationId: "org_anim_fanout",
      projectId: "proj_anim_fanout",
    });
    assert.equal(started.ok, true);
    if (!started.ok) return;
    const briefed = applyCdfTransition({
      sessionId: started.value.session.sessionId,
      action: "submit_brief",
      brief: "3D product turntable",
      expectedVersion: started.value.session.sessionVersion,
    });
    assert.equal(briefed.ok, true);
    if (!briefed.ok) return;

    const sessionId = briefed.value.session.sessionId;
    const storyboard = createArtifact({
      organizationId: "org_anim_fanout",
      projectId: "proj_anim_fanout",
      sessionId,
      serviceId: "videos",
      phaseId: "storyboard",
      artifactKey: "videos.storyboard",
      artifactType: "image_set",
      data: {
        frames: [{ id: "f1", title: "Frame 1" }],
        previewAssetRef: { vaultAssetId: VAULT_ID },
      } as never,
    });
    markValidated(storyboard.artifact.artifactId, 1);
    markApproved(storyboard.artifact.artifactId, 1);

    let session = getCdfSession(sessionId)!;
    const animIdx = briefed.value.config.phases.findIndex(
      (p) => p.id === "animation",
    );
    session = upsertSessionArtifactRef(session, {
      artifactId: storyboard.artifact.artifactId,
      version: 1,
      phaseId: "storyboard",
      artifactKey: "videos.storyboard",
      role: "generated",
    });
    session = upsertSessionArtifactRef(session, {
      artifactId: storyboard.artifact.artifactId,
      version: 1,
      phaseId: "storyboard",
      artifactKey: "videos.storyboard",
      role: "approved",
    });
    saveCdfSession({
      ...session,
      phaseId: "animation",
      phaseIndex: animIdx >= 0 ? animIdx : session.phaseIndex,
      status: "active",
      sessionVersion: session.sessionVersion + 1,
    });

    const handoff = await applyUpstreamVisualArtifactHandoff({
      metadata: {
        cdfSessionId: sessionId,
        cdfPhaseId: "animation",
        cdfServiceId: "videos",
        cdfGenerationModality: "video",
        executionId: "exec_anim_fanout_1",
      },
      organizationId: "org_anim_fanout",
      projectId: "proj_anim_fanout",
    });
    assert.equal(handoff.ok, true);
    if (!handoff.ok) return;
    const assets = handoff.value.metadata.assets as Array<
      Record<string, unknown>
    >;
    const pin = assets.find(
      (a) => a.cdfUpstreamArtifactId === storyboard.artifact.artifactId,
    );
    assert.ok(pin);
    assert.equal(pin!.cdfUpstreamArtifactVersion, 1);
    assert.equal(pin!.cdfUpstreamArtifactKey, "videos.storyboard");
  });

  it("6–8 — static audit: no provider/service/phase-ID fanout branches in video path", () => {
    const prepass = readPrepassSource();
    assert.match(
      prepass,
      /import\s*\{[^}]*isGenerationFanoutLeafMetadata[^}]*\}\s*from\s*["']\.\.\/\.\.\/generation\/generation-fanout["']/,
    );
    assert.match(
      prepass,
      /resolveIntraLeafFailoverChain/,
    );

    // Video branch uses the canonical helper (not a fabricated local boolean).
    const videoBranch = prepass.slice(
      prepass.indexOf("isVideoGenerationCapability(capabilityIdRaw)"),
      prepass.indexOf("isAudioSynthesizeCapability(capabilityIdRaw)"),
    );
    assert.match(videoBranch, /isGenerationFanoutLeafMetadata\(workingMetadata\)/);
    assert.doesNotMatch(
      videoBranch,
      /const\s+isGenerationFanoutLeafMetadata\s*=/,
    );
    assert.doesNotMatch(videoBranch, /providerId\s*===\s*["']provider\./);
    assert.doesNotMatch(videoBranch, /serviceId\s*===\s*["']videos["']/);
    assert.doesNotMatch(videoBranch, /cdfPhaseId\s*===\s*["']animation["']/);
    assert.doesNotMatch(videoBranch, /modelId\s*===\s*["']/);

    // Neighboring helpers remain distinct: ingest leaf-identity only.
    const ingest = readIngestSource();
    assert.match(ingest, /function isFanoutLeafMeta\(/);
    assert.doesNotMatch(ingest, /isGenerationFanoutLeafMetadata/);
  });
});
