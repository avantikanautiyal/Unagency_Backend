/**
 * Backend: video subtype composition + verification + async submitting recovery.
 */

import assert from "node:assert/strict";
import {
  VIDEO_PRODUCT_SUBCATEGORY_KEYS,
  resolveVideoCompositionContract,
  resolveVideoSubtypeDeliverableProfile,
} from "../../../../Unagency-frontend/packages/api/src/domain/cdf/video-subtype-deliverable-profiles";
import { resolveDeliverableCompositionForPhase } from "../../../src/platform/cdf/generation-context/resolve-deliverable-composition";
import { deriveVisualVerificationRequirements } from "../../../src/platform/cdf/generation-validation/visual-verification-requirements";
import { evaluateStructuralCompositionCompliance } from "../../../src/platform/cdf/generation-validation/structural-composition-validation";
import { planVideoGenerationFanout } from "../../../src/platform/generation/generation-fanout";
import { InMemoryProviderOperationStore } from "../../../src/platform/providers/async/store/in-memory-provider-operation-store";
import { ProviderOperationReconciler } from "../../../src/platform/providers/async/reconciliation/provider-operation-reconciler";
import type { ProviderOperationRecord } from "../../../src/platform/providers/async/contracts/provider-operation";
import { UNCANCELLED_TOKEN } from "../../../src/platform/providers/runtime/contracts/cancellation";

describe("video subtype composition resolution", () => {
  for (const key of VIDEO_PRODUCT_SUBCATEGORY_KEYS) {
    it(`resolves composition for ${key}`, () => {
      const profile = resolveVideoSubtypeDeliverableProfile({ productKey: key })!;
      const subtype = key.split("/")[1]!;
      const resolved = resolveDeliverableCompositionForPhase({
        serviceId: "videos",
        phaseId: profile.terminalPhaseId,
        service: "video",
        subtype,
        productKey: key,
      });
      assert.equal(resolved.required, true);
      assert.ok(resolved.contract);
      assert.equal(resolved.deliverableKind, profile.terminalDeliverableKind);

      const overlay = resolveVideoCompositionContract({
        deliverableKind: profile.terminalDeliverableKind,
        productKey: key,
        phaseId: profile.terminalPhaseId,
      });
      assert.ok(overlay);
      if (profile.requiresVideoGeneration) {
        assert.ok(overlay!.requiredElements.includes("motion_subject"));
      } else {
        assert.ok(overlay!.requiredElements.includes("frame_sequence"));
      }
    });
  }
});

describe("video verification requirements", () => {
  it("derives motion_subject + media_existence for video contracts", () => {
    const contract = resolveVideoCompositionContract({
      deliverableKind: "video",
      productKey: "video/2d-animation",
      phaseId: "animation",
    })!;
    const vreqs = deriveVisualVerificationRequirements(contract)!;
    const ids = vreqs.criteria.map((c) => c.id);
    assert.ok(ids.includes("motion_subject"));
    assert.ok(ids.includes("media_existence"));
  });

  it("NON_COMPLIANT when video phase gets image mime", () => {
    const contract = resolveVideoCompositionContract({
      deliverableKind: "video",
      productKey: "video/promo-videos",
      phaseId: "animation",
    })!;
    const vreqs = deriveVisualVerificationRequirements(contract);
    const result = evaluateStructuralCompositionCompliance({
      contract,
      verificationRequirements: vreqs,
      evidence: {
        hasPreviewAsset: true,
        canvasActual: { mimeType: "image/png" },
      },
    });
    const media = result.criteria.find((c) => c.criterionId === "media_existence");
    assert.ok(media);
    assert.equal(media!.status, "NON_COMPLIANT");
  });

  it("COMPLIANT media_existence for video/mp4", () => {
    const contract = resolveVideoCompositionContract({
      deliverableKind: "video",
      productKey: "video/corporate-films",
      phaseId: "animation",
    })!;
    const vreqs = deriveVisualVerificationRequirements(contract);
    const result = evaluateStructuralCompositionCompliance({
      contract,
      verificationRequirements: vreqs,
      evidence: {
        hasPreviewAsset: true,
        canvasActual: { mimeType: "video/mp4" },
      },
    });
    const media = result.criteria.find((c) => c.criterionId === "media_existence");
    assert.equal(media!.status, "COMPLIANT");
    const motion = result.criteria.find((c) => c.criterionId === "motion_subject");
    assert.equal(motion!.status, "COMPLIANT");
  });

  it("frame_sequence for storyboard product", () => {
    const contract = resolveVideoCompositionContract({
      deliverableKind: "storyboard_frame",
      productKey: "video/storyboards",
      phaseId: "storyboard",
    })!;
    const vreqs = deriveVisualVerificationRequirements(contract)!;
    assert.ok(vreqs.criteria.some((c) => c.id === "frame_sequence"));
  });
});

describe("video fanout planning", () => {
  it("plans independent LIVE video engines", () => {
    const plan = planVideoGenerationFanout({
      useCase: "cinematic",
      groupId: "g1",
    });
    assert.equal(plan.targets.length, 3);
    assert.equal(plan.disableCrossProviderFailover, true);
    const ids = new Set(plan.targets.map((t) => t.providerId));
    assert.equal(ids.size, plan.targets.length);
    const kling = plan.targets.find((t) => t.providerId === "provider.kling");
    assert.equal(kling?.availability, "unavailable");
    const live = plan.targets.filter((t) => t.availability === "selected");
    assert.deepEqual(
      live.map((t) => t.providerId).sort(),
      ["provider.luma", "provider.minimax"],
    );
  });
});

describe("async submitting orphan recovery", () => {
  it("fails stale submitting without providerJobId", async () => {
    const store = new InMemoryProviderOperationStore();
    const createdAt = new Date(Date.now() - 120_000).toISOString();
    const op: ProviderOperationRecord = {
      operationId: "prov_op_stale",
      executionId: "exec_1",
      attemptId: "att_1",
      organizationId: "org_1",
      workspaceId: "ws_1",
      providerId: "provider.kling",
      modelId: "kling-2-6",
      capabilityId: "video.generate",
      submissionKey: "sub_1",
      state: "submitting",
      idempotencyKey: "sub_1",
      pollCount: 0,
      createdAt,
      updatedAt: createdAt,
    };
    await store.create(op);

    const reconciler = new ProviderOperationReconciler({
      store,
      ingestion: {} as never,
      artifacts: {} as never,
      leaseTtlMs: 30_000,
      nowIso: () => new Date().toISOString(),
      clockMs: () => Date.now(),
    });

    const result = await reconciler.tick(
      "worker_test",
      () => undefined,
      () => ({}) as never,
      UNCANCELLED_TOKEN,
      10,
    );
    assert.equal(result.ok, true);
    const after = await store.get("prov_op_stale");
    assert.equal(after?.state, "failed");
    assert.equal(after?.errorCode, "provider_submit_stale");
  });
});
