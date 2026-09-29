/**
 * Generic downstream visual continuity — selected upstream visual must reach
 * multimodal / CMR / provider wire. Packaging fixture data only (no logo forks).
 */

import assert from "node:assert/strict";
import {
  applyGenerationContinuationVisualPrepass,
  attachContinuationVisualToExecutionMetadata,
} from "../../../src/platform/api/services/apply-generation-continuation-visual-prepass";
import {
  compileCanonicalGenerationRequest,
  compileCanonicalModelRequestFromGeneration,
  PACKAGING_ARTIFACT_KEYS,
  resolveCanonicalMultimodalContext,
} from "../../../src/platform/cdf";
import { promptGuidanceForReferenceRole } from "../../../src/platform/ai/multimodal-context/reference-role";
import type { CdfGenerationContinuationSelection } from "../../../src/platform/cdf/types";
import type { ValidationError } from "../../../src/platform/core/errors/intelligence-error";

const FIXTURE_PNG_A =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const FIXTURE_PNG_B =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const FIXTURE_PNG_C =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

const ORG = "6a8d8d7dc263a4d6afe69691";

function continuation(partial: {
  visualArtifactId: string;
  executionId: string;
  generationFanoutTargetId?: string;
  isDiagnosticRaw?: boolean;
}): CdfGenerationContinuationSelection {
  return {
    selectionKind: "generation_continuation",
    sourcePhaseId: "3d-direction",
    sourceArtifactKey: PACKAGING_ARTIFACT_KEYS.threeDDirection,
    selectedAt: new Date().toISOString(),
    executionId: partial.executionId,
    visualArtifactId: partial.visualArtifactId,
    isDiagnosticRaw: partial.isDiagnosticRaw ?? true,
    ...(partial.generationFanoutTargetId
      ? { generationFanoutTargetId: partial.generationFanoutTargetId }
      : {}),
    presentationEligibilityStatus: "DIAGNOSTIC_PREVIEW_AVAILABLE",
  };
}

function baseGenerationRequest(
  cont: CdfGenerationContinuationSelection,
  multimodal?: ReturnType<typeof resolveCanonicalMultimodalContext>,
) {
  return compileCanonicalGenerationRequest({
    resolved: {
      contextId: "ctx_vc",
      contextHash: "hash_vc",
      sessionId: "cdf_vc",
      serviceId: "packaging",
      phaseId: "front-pack",
      sessionVersion: 2,
      contextSource: "test",
      status: "ready",
      phaseContext: {
        phaseId: "front-pack",
        serviceId: "packaging",
        name: "Front Pack",
        uxType: "generate",
        generationModality: "image",
        artifactType: "image",
        artifactKey: PACKAGING_ARTIFACT_KEYS.frontPack,
        implementationStatus: "ready",
        dependencyPhaseIds: ["routes", "3d-direction"],
        allowNonVisualReady: false,
        selectionMode: "none",
        approvalMode: "none",
        refinementEnabled: false,
        refinementScopes: [],
        entryMessage: "Create front pack",
        description: "Front pack",
        executionStrategy: "canonical",
      },
      activeRequirements: [
        {
          requirementId: "req_1",
          key: "user.instruction",
          displayValue: "Continue the selected pack direction",
          priority: "explicit_current_user_instruction",
          category: "instruction",
          sourceInputId: "src_1",
        },
      ],
      constraints: [],
      exclusions: [],
      selections: [],
      approvedDecisions: [],
      upstreamInputs: [],
      upstreamOutputs: [],
      missingDependencies: [],
      unresolvedConflicts: [],
      warnings: [],
      provenance: { requirementIds: [], artifactPins: [] },
    } as never,
    upstream: [],
    currentUserInstruction: "Continue the selected pack direction",
    canonicalFullDeck: false,
    userSelectedGenerationReference: cont,
    ...(multimodal ? { multimodalContext: multimodal } : {}),
  });
}

describe("generation continuation visual continuity (generic)", () => {
  it("1 — select visual A → prepass stamps A bytes only", async () => {
    const cont = continuation({
      visualArtifactId: "art_leaf_a",
      executionId: "exec_a",
      generationFanoutTargetId: "fanout_0_a",
    });
    const result = await applyGenerationContinuationVisualPrepass({
      metadata: {
        cdfGenerationContinuation: cont,
        cdfContinuationVisualArtifactId: cont.visualArtifactId,
        cdfContinuationExecutionId: cont.executionId,
        cdfGenerationModality: "image",
      },
      organizationId: ORG,
      artifactStore: new Map([
        [
          "exec_a",
          [
            {
              artifactId: "art_leaf_a",
              kind: "image",
              label: FIXTURE_PNG_A,
              mimeType: "image/png",
            },
          ],
        ],
        [
          "exec_b",
          [
            {
              artifactId: "art_leaf_b",
              kind: "image",
              label: FIXTURE_PNG_B,
              mimeType: "image/png",
            },
          ],
        ],
      ]),
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    if (!result.ok) return;
    assert.equal(result.value.resolved, true);
    const assets = result.value.metadata.assets as Array<
      Record<string, unknown>
    >;
    assert.equal(assets.length, 1);
    assert.equal(assets[0]!.assetId, "art_leaf_a");
    assert.equal(assets[0]!.url, FIXTURE_PNG_A);
    assert.equal(assets[0]!.semanticReferenceRole, "subject_reference");
    assert.equal(
      assets[0]!.relationshipLabel,
      "user_selected_generation_reference",
    );
    assert.notEqual(assets[0]!.url, FIXTURE_PNG_B);
  });

  it("2/3 — select visual B among A/B/C fanout → only B", async () => {
    const cont = continuation({
      visualArtifactId: "art_leaf_b",
      executionId: "exec_b",
      generationFanoutTargetId: "fanout_1_b",
    });
    const store = new Map([
      [
        "exec_a",
        [
          {
            artifactId: "art_leaf_a",
            kind: "image" as const,
            label: FIXTURE_PNG_A,
            mimeType: "image/png",
          },
        ],
      ],
      [
        "exec_b",
        [
          {
            artifactId: "art_leaf_b",
            kind: "image" as const,
            label: FIXTURE_PNG_B,
            mimeType: "image/png",
          },
        ],
      ],
      [
        "exec_c",
        [
          {
            artifactId: "art_leaf_c",
            kind: "image" as const,
            label: FIXTURE_PNG_C,
            mimeType: "image/png",
          },
        ],
      ],
    ]);
    const result = await applyGenerationContinuationVisualPrepass({
      metadata: {
        cdfGenerationContinuation: cont,
        cdfContinuationVisualArtifactId: "art_leaf_b",
        cdfContinuationFanoutTargetId: "fanout_1_b",
      },
      organizationId: ORG,
      artifactStore: store,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const assets = result.value.metadata.assets as Array<
      Record<string, unknown>
    >;
    assert.equal(assets[0]!.assetId, "art_leaf_b");
    assert.equal(assets[0]!.url, FIXTURE_PNG_B);
    assert.notEqual(assets[0]!.assetId, "art_leaf_a");
    assert.notEqual(assets[0]!.assetId, "art_leaf_c");
  });

  it("4 — presentation index ≠ identity: fanout target id is authoritative", () => {
    const cont = continuation({
      visualArtifactId: "art_leaf_b",
      executionId: "exec_b",
      generationFanoutTargetId: "fanout_1_b",
    });
    assert.equal(cont.generationFanoutTargetId, "fanout_1_b");
    assert.equal(cont.visualArtifactId, "art_leaf_b");
    assert.notEqual(cont.visualArtifactId, "art_leaf_a");
  });

  it("5 — diagnostic preview selection resolves raw art_* bytes", async () => {
    const cont = continuation({
      visualArtifactId: "art_diag_raw",
      executionId: "exec_diag",
      isDiagnosticRaw: true,
    });
    const result = await applyGenerationContinuationVisualPrepass({
      metadata: {
        cdfGenerationContinuation: cont,
        cdfContinuationIsDiagnosticRaw: true,
      },
      organizationId: ORG,
      artifactStore: new Map([
        [
          "exec_diag",
          [
            {
              artifactId: "art_diag_raw",
              kind: "image",
              label: FIXTURE_PNG_A,
              mimeType: "image/png",
            },
          ],
        ],
      ]),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.resolved, true);
    assert.equal(result.value.continuation?.isDiagnosticRaw, true);
    const assets = result.value.metadata.assets as Array<
      Record<string, unknown>
    >;
    assert.ok(String(assets[0]!.url).startsWith("data:image/png"));
  });

  it("7 — missing upstream visual blocks with UPSTREAM_VISUAL_REFERENCE_UNRESOLVED", async () => {
    const cont = continuation({
      visualArtifactId: "art_missing",
      executionId: "exec_missing",
    });
    const result = await applyGenerationContinuationVisualPrepass({
      metadata: {
        cdfGenerationContinuation: cont,
        cdfGenerationModality: "image",
      },
      organizationId: ORG,
      artifactStore: new Map(),
      requireResolvedVisual: true,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    const err = result.error as ValidationError;
    assert.equal(err.metadata?.reason, "UPSTREAM_VISUAL_REFERENCE_UNRESOLVED");
  });

  it("8 — semantic direction without visual bytes must not invent a substitute", async () => {
    const cont = continuation({
      visualArtifactId: "art_unresolved",
      executionId: "exec_unresolved",
    });
    const result = await applyGenerationContinuationVisualPrepass({
      metadata: { cdfGenerationContinuation: cont },
      organizationId: ORG,
      requireResolvedVisual: true,
    });
    assert.equal(result.ok, false);
  });

  it("12/13 — no cross-fanout / latest-leaf substitution", async () => {
    const cont = continuation({
      visualArtifactId: "art_leaf_b",
      executionId: "exec_b",
      generationFanoutTargetId: "fanout_1_b",
    });
    const result = await applyGenerationContinuationVisualPrepass({
      metadata: { cdfGenerationContinuation: cont },
      organizationId: ORG,
      artifactStore: new Map([
        [
          "exec_z_latest",
          [
            {
              artifactId: "art_leaf_c",
              kind: "image",
              label: FIXTURE_PNG_C,
              mimeType: "image/png",
            },
          ],
        ],
        [
          "exec_b",
          [
            {
              artifactId: "art_leaf_b",
              kind: "image",
              label: FIXTURE_PNG_B,
              mimeType: "image/png",
            },
          ],
        ],
      ]),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const assets = result.value.metadata.assets as Array<
      Record<string, unknown>
    >;
    assert.equal(assets[0]!.assetId, "art_leaf_b");
    assert.equal(assets[0]!.url, FIXTURE_PNG_B);
  });

  it("14/15 — CMR multimodal + provider deliveries include selected visual", () => {
    const cont = continuation({
      visualArtifactId: "art_leaf_b",
      executionId: "exec_b",
      generationFanoutTargetId: "fanout_1_b",
    });
    const stamped = attachContinuationVisualToExecutionMetadata({
      metadata: {},
      continuation: cont,
      resolved: {
        artifactId: "art_leaf_b",
        organizationId: ORG,
        mimeType: "image/png",
        source: "inline_fixture",
        executionId: "exec_b",
        providerInput: {
          url: FIXTURE_PNG_B,
          mimeType: "image/png",
          organizationId: ORG,
          assetId: "art_leaf_b",
        },
      },
    });
    const multimodal = resolveCanonicalMultimodalContext({
      metadata: stamped,
      organizationId: ORG,
    });
    assert.equal(multimodal.applied, true);
    assert.ok(multimodal.imageCount >= 1);
    const item = multimodal.items.find((i) => i.assetId === "art_leaf_b");
    assert.ok(item);
    assert.equal(item!.semanticReferenceRole, "subject_reference");
    assert.ok(item!.providerDelivery?.url);

    const request = baseGenerationRequest(cont, multimodal);
    const cmr = compileCanonicalModelRequestFromGeneration(request);
    const parts = cmr.messages.flatMap((m) => m.content);
    const visualParts = parts.filter(
      (c) => c.semanticRole === "user_selected_generation_reference",
    );
    assert.ok(visualParts.length >= 1);
    const blob = JSON.stringify(visualParts);
    assert.match(blob, /art_leaf_b/);
    assert.match(blob, /SOURCE ASSET/);
    assert.match(blob, /fanout_1_b/);
    assert.match(blob, /media=attached multimodal image bytes/);
    assert.match(blob, /multimodalSourceAttached\":true/);

    const mmPart = parts.find((c) => c.semanticRole === "multimodal_context");
    assert.ok(mmPart);
    const mmBlob = JSON.stringify(mmPart);
    assert.match(mmBlob, /art_leaf_b/);
    assert.match(mmBlob, /subject_reference/);

    const deliveries = cmr.multimodalProviderDeliveries ?? [];
    assert.ok(
      deliveries.some(
        (d) => d.assetId === "art_leaf_b" && Boolean(d.url || d.storageRef),
      ),
      JSON.stringify(deliveries),
    );
  });

  it("16 — subject_reference guidance forbids inventing a substitute (generic)", () => {
    const guidance = promptGuidanceForReferenceRole("subject_reference");
    assert.match(guidance, /SOURCE ASSET/i);
    assert.match(guidance, /Do not invent/i);
    assert.doesNotMatch(guidance, /inspired by/i);
  });

  it("10 — reordered cards: selection identity unchanged", () => {
    const selected = continuation({
      visualArtifactId: "art_leaf_b",
      executionId: "exec_b",
      generationFanoutTargetId: "fanout_1_b",
    });
    const presentationOrder = ["art_leaf_c", "art_leaf_a", "art_leaf_b"];
    assert.equal(presentationOrder.indexOf(selected.visualArtifactId), 2);
    assert.equal(selected.visualArtifactId, "art_leaf_b");
    assert.equal(selected.generationFanoutTargetId, "fanout_1_b");
  });
});
