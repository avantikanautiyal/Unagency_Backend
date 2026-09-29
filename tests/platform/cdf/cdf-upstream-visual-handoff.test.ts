/**
 * Generic upstream visual ArtifactVersion handoff.
 *
 * Proves IMAGE→VIDEO (and related) physical continuity:
 * exact X@V → Vault bytes → metadata.assets → provider-usable input.
 * Not metadata-only presence in upstreamArtifacts[].
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  applyCdfTransition,
  applyUpstreamVisualArtifactHandoff,
  CDF_UPSTREAM_ARTIFACT_UNRESOLVABLE,
  createArtifact,
  extractVaultAssetIdFromArtifactData,
  getCdfSession,
  markApproved,
  markValidated,
  resetCdfArtifactEngineForTests,
  resetCdfRequirementEngineForTests,
  resetCdfSessionsForTests,
  resolveCanonicalArtifactVisualBytes,
  saveCdfSession,
  upsertSessionArtifactRef,
} from "../../../src/platform/cdf";
import { createMemoryVaultAssetResolver } from "../../../src/platform/cdf/rendering";
import {
  resetDefaultVaultAssetResolverForTests,
  setDefaultVaultAssetResolver,
} from "../../../src/platform/cdf/rendering/default-vault-asset-resolver";
import { extractInputAssets } from "../../../src/platform/providers/common/input-asset-validator";

const VAULT_ID = "507f1f77bcf86cd7994390aa";
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function readHandoffSource(): string {
  return fs.readFileSync(
    path.join(
      __dirname,
      "../../../src/platform/cdf/generation-context/upstream-visual-handoff.ts",
    ),
    "utf8",
  );
}

describe("CDF upstream visual artifact handoff (generic)", () => {
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

  async function seedApprovedStoryboardSession() {
    const started = applyCdfTransition({
      action: "start",
      serviceId: "videos",
      productMode: "ai",
      organizationId: "org_handoff",
      projectId: "proj_handoff",
    });
    assert.equal(started.ok, true);
    if (!started.ok) throw new Error("start");
    const briefed = applyCdfTransition({
      sessionId: started.value.session.sessionId,
      action: "submit_brief",
      brief: "15s launch film",
      expectedVersion: started.value.session.sessionVersion,
    });
    assert.equal(briefed.ok, true);
    if (!briefed.ok) throw new Error("brief");

    const sessionId = briefed.value.session.sessionId;
    const storyboard = createArtifact({
      organizationId: "org_handoff",
      projectId: "proj_handoff",
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
    const cfgPhases = briefed.value.config.phases;
    const animIdx = cfgPhases.findIndex((p) => p.id === "animation");
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

    return {
      sessionId,
      artifactId: storyboard.artifact.artifactId,
      artifactVersion: 1 as const,
      artifactKey: "videos.storyboard",
    };
  }

  it("F — IMAGE→VIDEO: exact storyboard X@V resolves to provider-usable visual assets", async () => {
    const seeded = await seedApprovedStoryboardSession();
    const bytes = await resolveCanonicalArtifactVisualBytes({
      artifactId: seeded.artifactId,
      artifactVersion: seeded.artifactVersion,
      organizationId: "org_handoff",
      projectId: "proj_handoff",
    });
    assert.equal(bytes.ok, true);
    if (!bytes.ok) return;
    assert.ok(bytes.resolved.providerInput.url?.startsWith("data:image/png"));
    assert.equal(bytes.contentHash?.length, 64);

    const handoff = await applyUpstreamVisualArtifactHandoff({
      metadata: {
        cdfSessionId: seeded.sessionId,
        cdfPhaseId: "animation",
        cdfServiceId: "videos",
        cdfGenerationModality: "video",
        executionId: "exec_anim_1",
      },
      organizationId: "org_handoff",
      projectId: "proj_handoff",
    });
    assert.equal(handoff.ok, true);
    if (!handoff.ok) return;
    assert.ok(handoff.value.attachedCount >= 1);
    assert.equal(handoff.value.metadata.cdfUpstreamVisualHandoffApplied, true);
    assert.equal(handoff.value.metadata.referenceInputPresent, true);

    const assets = handoff.value.metadata.assets as Array<
      Record<string, unknown>
    >;
    const pin = assets.find(
      (a) => a.cdfUpstreamArtifactId === seeded.artifactId,
    );
    assert.ok(pin);
    assert.equal(pin!.cdfUpstreamArtifactVersion, 1);
    assert.equal(pin!.cdfUpstreamArtifactKey, seeded.artifactKey);
    assert.equal(pin!.cdfUpstreamPhaseId, "storyboard");
    assert.ok(typeof pin!.url === "string" && pin!.url.startsWith("data:"));
    assert.equal(pin!.cdfUpstreamContentHash, bytes.contentHash);

    // Provider wire: shared asset extractor sees the visual (S)
    const extracted = extractInputAssets({
      metadata: handoff.value.metadata,
      assets: handoff.value.metadata.assets,
    } as never);
    assert.ok(extracted.length >= 1);
  });

  it("K — artifact exists but media cannot resolve → fail closed", async () => {
    const seeded = await seedApprovedStoryboardSession();
    setDefaultVaultAssetResolver(createMemoryVaultAssetResolver({}));
    const handoff = await applyUpstreamVisualArtifactHandoff({
      metadata: {
        cdfSessionId: seeded.sessionId,
        cdfPhaseId: "animation",
        cdfServiceId: "videos",
        cdfGenerationModality: "video",
      },
      organizationId: "org_handoff",
      projectId: "proj_handoff",
    });
    assert.equal(handoff.ok, false);
    if (handoff.ok) return;
    assert.equal(
      (handoff.error as { metadata?: { reason?: string } }).metadata?.reason,
      CDF_UPSTREAM_ARTIFACT_UNRESOLVABLE,
    );
  });

  it("I — exact X@V only (does not substitute newer version)", async () => {
    const seeded = await seedApprovedStoryboardSession();
    const handoff = await applyUpstreamVisualArtifactHandoff({
      metadata: {
        cdfSessionId: seeded.sessionId,
        cdfPhaseId: "animation",
        cdfServiceId: "videos",
        cdfGenerationModality: "video",
      },
      organizationId: "org_handoff",
      projectId: "proj_handoff",
    });
    assert.equal(handoff.ok, true);
    if (!handoff.ok) return;
    const assets = handoff.value.metadata.assets as Array<
      Record<string, unknown>
    >;
    const pin = assets.find(
      (a) => a.cdfUpstreamArtifactId === seeded.artifactId,
    );
    assert.equal(pin!.cdfUpstreamArtifactVersion, seeded.artifactVersion);
  });

  it("E — non-visual emission modality does not attach media (TEXT skip)", async () => {
    const seeded = await seedApprovedStoryboardSession();
    const handoff = await applyUpstreamVisualArtifactHandoff({
      metadata: {
        cdfSessionId: seeded.sessionId,
        cdfPhaseId: "full-script",
        cdfServiceId: "videos",
        cdfGenerationModality: "text",
      },
      organizationId: "org_handoff",
      projectId: "proj_handoff",
    });
    assert.equal(handoff.ok, true);
    if (!handoff.ok) return;
    assert.equal(handoff.value.attachedCount, 0);
  });

  it("extractVaultAssetId reads previewAssetRef and candidates", () => {
    assert.equal(
      extractVaultAssetIdFromArtifactData({
        previewAssetRef: { vaultAssetId: VAULT_ID },
      }),
      VAULT_ID,
    );
    assert.equal(
      extractVaultAssetIdFromArtifactData({
        candidates: [{ previewAssetRef: { vaultAssetId: VAULT_ID } }],
      }),
      VAULT_ID,
    );
    assert.equal(extractVaultAssetIdFromArtifactData({ body: "text" }), undefined);
  });

  it("18 — no service/phase/provider semantic branches in handoff", () => {
    const src = readHandoffSource();
    assert.doesNotMatch(src, /serviceId\s*===\s*["']videos["']/);
    assert.doesNotMatch(src, /phaseId\s*===\s*["']animation["']/);
    assert.doesNotMatch(src, /phaseId\s*===\s*["']storyboard["']/);
    assert.doesNotMatch(src, /artifactKey\s*===\s*["']videos\.storyboard["']/);
    assert.doesNotMatch(src, /providerId\s*===/);
    assert.match(src, /CDF_UPSTREAM_ARTIFACT_UNRESOLVABLE/);
    assert.match(src, /cdf\.upstream_artifact/);
  });

  it("forensic: provider_received_upstream_visual evidence fields stamped", async () => {
    const seeded = await seedApprovedStoryboardSession();
    const handoff = await applyUpstreamVisualArtifactHandoff({
      metadata: {
        cdfSessionId: seeded.sessionId,
        cdfPhaseId: "animation",
        cdfServiceId: "videos",
        cdfGenerationModality: "video",
        executionId: "exec_forensic",
      },
      organizationId: "org_handoff",
      projectId: "proj_handoff",
    });
    assert.equal(handoff.ok, true);
    if (!handoff.ok) return;
    assert.equal(handoff.value.metadata.cdfUpstreamVisualAttachedCount, 1);
    const assets = handoff.value.metadata.assets as Array<
      Record<string, unknown>
    >;
    assert.ok(
      assets.some(
        (a) =>
          a.relationshipLabel === "cdf_upstream_visual_artifact" &&
          a.cdfUpstreamArtifactId === seeded.artifactId &&
          typeof a.cdfUpstreamContentHash === "string",
      ),
    );
  });
});
