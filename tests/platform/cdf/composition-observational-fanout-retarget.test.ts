/**
 * Composition / structural diagnostics are observational — provider success
 * + persisted media remain usable (AVAILABLE_WITH_WARNINGS) with exact X@V.
 * Fanout: OpenAI + Gemini + OpenAI-alt; Ideogram absent; quantity cannot collapse.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  GENERATION_FANOUT_PROVIDER_FAMILIES,
  buildGenerationFanoutLeafMetadata,
  planImageGenerationFanout,
  resolveGenerationFanoutContract,
  resolveIntraLeafFailoverChain,
} from "../../../src/platform/generation/generation-fanout";
import {
  resolveGeneratedDeliverablePresentationEligibility,
  isPresentationEligibilityAvailable,
  creativeRouteMayContinueWithGeneration,
} from "../../../../Unagency-frontend/packages/api/src/domain/cdf/generated-deliverable-presentation-eligibility";

describe("composition observational + 3-leaf OpenAI/Gemini/OpenAI-alt", () => {
  it("1 — provider success + NON_COMPLIANT + accepted AV → usable with warnings", () => {
    const elig = resolveGeneratedDeliverablePresentationEligibility({
      executionId: "exec_nc",
      executionStatus: "succeeded",
      requiresCanonicalCompletion: true,
      cdfCanonicalCompletionEstablished: true,
      cdfGeneratedArtifactsBound: true,
      cdfArtifactId: "cdfart_nc_1",
      cdfArtifactVersion: 1,
      cdfArtifactKey: "social-media.output",
      structuralStatus: "NON_COMPLIANT",
      compositionOutcome: "COMPOSITION_FAILED",
      rawMediaArtifactIds: ["art_syncimg_1"],
    });
    assert.equal(elig.status, "AVAILABLE_WITH_WARNINGS");
    assert.equal(isPresentationEligibilityAvailable(elig), true);
    assert.equal(elig.canonicalArtifact?.artifactId, "cdfart_nc_1");
  });

  it("2 — provider success + UNVERIFIABLE + accepted AV → usable with warnings", () => {
    const elig = resolveGeneratedDeliverablePresentationEligibility({
      executionId: "exec_uv",
      executionStatus: "succeeded",
      requiresCanonicalCompletion: true,
      cdfCanonicalCompletionEstablished: true,
      cdfGeneratedArtifactsBound: true,
      cdfArtifactId: "cdfart_uv_1",
      cdfArtifactVersion: 2,
      cdfArtifactKey: "social-media.output",
      structuralStatus: "UNVERIFIABLE",
      rawMediaArtifactIds: ["art_syncimg_2"],
    });
    assert.equal(elig.status, "AVAILABLE_WITH_WARNINGS");
    assert.equal(isPresentationEligibilityAvailable(elig), true);
  });

  it("3 — missing brand-mark / composition failed with AV does not hide creative", () => {
    const elig = resolveGeneratedDeliverablePresentationEligibility({
      executionId: "exec_brand",
      executionStatus: "succeeded",
      requiresCanonicalCompletion: true,
      cdfCanonicalCompletionEstablished: true,
      cdfGeneratedArtifactsBound: true,
      cdfArtifactId: "cdfart_brand_1",
      cdfArtifactVersion: 1,
      cdfArtifactKey: "social-media.output",
      structuralStatus: "UNVERIFIABLE",
      compositionOutcome: "COMPOSITION_FAILED",
      productCompletionBlockReason: "missing_authoritative_brand_mark_bytes",
      rawMediaArtifactIds: ["art_syncimg_3"],
    });
    assert.equal(elig.status, "AVAILABLE_WITH_WARNINGS");
    assert.equal(
      creativeRouteMayContinueWithGeneration({
        presentationEligibilityStatus: elig.status,
        imageUri: "https://example.com/x.png",
        artifactId: "cdfart_brand_1",
      }),
      true,
    );
  });

  it("4/5/6 — exactly 3 leaves; Ideogram absent; two distinct Gemini models + OpenAI", () => {
    const plan = resolveGenerationFanoutContract({
      useCase: "general",
      groupId: "live_fix",
      executableProviderIds: new Set(["provider.openai", "provider.google"]),
    });
    assert.equal(plan.cardinality, 3);
    assert.equal(plan.targets.length, 3);
    assert.equal(
      plan.targets.some((t) => t.providerId === "provider.ideogram"),
      false,
    );
    assert.equal(plan.targets[0]!.providerId, "provider.google");
    assert.equal(plan.targets[0]!.modelId, "gemini-3.1-flash-image");
    assert.equal(plan.targets[1]!.providerId, "provider.google");
    assert.equal(plan.targets[1]!.modelId, "gemini-3-pro-image");
    assert.equal(plan.targets[2]!.providerId, "provider.openai");
    assert.equal(plan.targets[2]!.modelId, "gpt-image-1.5");
    assert.notEqual(plan.targets[0]!.modelId, plan.targets[1]!.modelId);
  });

  it("7/8 — primary failure same-provider fallback; never sibling leaf", () => {
    const plan = planImageGenerationFanout({
      useCase: "general",
      groupId: "fb",
      executableProviderIds: new Set(["provider.openai", "provider.google"]),
    });
    const leafA = plan.targets[0]!;
    const leafB = plan.targets[1]!;
    const metaA = buildGenerationFanoutLeafMetadata({ plan, target: leafA });
    const chain = resolveIntraLeafFailoverChain({
      primaryProviderId: leafA.providerId,
      primaryModelId: leafA.modelId,
      matrixChain: [
        { providerId: leafB.providerId, modelId: leafB.modelId },
        { providerId: "provider.openai", modelId: "gpt-image-1.5" },
      ],
      excludeModelKeys: new Set([`${leafB.providerId}::${leafB.modelId}`]),
    });
    assert.ok(chain.length >= 1);
    for (const step of chain) {
      assert.equal(step.providerId, "provider.google");
      assert.notEqual(step.modelId, leafB.modelId);
    }
    assert.equal(metaA.generationFanoutTargetId, leafA.targetId);
  });

  it("9 — quantity is not a fanout input (API surface)", () => {
    const src = fs.readFileSync(
      path.join(
        __dirname,
        "../../../src/platform/generation/generation-fanout.ts",
      ),
      "utf8",
    );
    assert.match(src, /GenerationFanoutContract/);
    assert.match(src, /ExecutionSpec\.quantity/);
    const planFn = src.slice(src.indexOf("export function planImageGenerationFanout"));
    assert.doesNotMatch(planFn, /quantity\s*[:=]/);
    assert.deepEqual(
      [...GENERATION_FANOUT_PROVIDER_FAMILIES],
      ["provider.google", "provider.google", "provider.openai"],
    );
  });

  it("ingest soft-gates composition — no hard return on brand-mark missing", () => {
    const ingest = fs.readFileSync(
      path.join(
        __dirname,
        "../../../src/platform/api/services/execution-cdf-canonical-ingest.ts",
      ),
      "utf8",
    );
    // Soft path: composition failure must not set canonicalImageBridgeFailure
    // for compositionBridge.applied && !ok.
    const failBlock = ingest.slice(
      ingest.indexOf("compositionBridge.applied && !compositionBridge.ok"),
      ingest.indexOf("compositionBridge.applied && compositionBridge.ok"),
    );
    assert.doesNotMatch(failBlock, /canonicalImageBridgeFailure\s*=/);
    assert.match(failBlock, /Observational quality plane/);
    assert.match(ingest, /execution\.cdf_structural_compliance\.warning/);
  });
});
