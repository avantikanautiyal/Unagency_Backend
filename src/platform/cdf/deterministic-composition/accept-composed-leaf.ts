/**
 * One leaf: visual plate → compose → acceptance evidence package.
 * Generic — no provider/service/platform branches.
 */

import { createHash } from "crypto";
import type { DeliverableCompositionContract } from "../../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";
import { deriveVisualVerificationRequirements } from "../generation-validation/visual-verification-requirements";
import {
  evaluateStructuralCompositionCompliance,
  type StructuralArtifactEvidence,
  type StructuralValidationResult,
} from "../generation-validation/structural-composition-validation";
import { composeDeliverable, composedDiffersFromVisualPlate } from "./compose-raster";
import {
  buildCommunicationCompositionInput,
  type SharedCompositionAuthority,
} from "./composition-authority-input";
import { normalizeVisualGenerationResult } from "./normalize-visual-generation";
import type {
  ComposedDeliverable,
  CompositionFailure,
  VisualGenerationResult,
} from "./types";

export type LeafCompositionIdentity = {
  readonly executionId?: string;
  readonly fanoutGroupId?: string;
  readonly fanoutTargetId?: string;
  readonly providerId?: string;
  readonly modelId?: string;
};

export type LeafCompositionAcceptanceOk = {
  readonly ok: true;
  readonly outcome: "COMPOSED_ACCEPTED" | "COMPOSED_REJECTED";
  readonly composed: ComposedDeliverable;
  readonly structural: StructuralValidationResult;
  readonly evidence: StructuralArtifactEvidence;
  readonly identity: LeafCompositionIdentity;
  readonly visualSourceHash: string;
  readonly composedHash: string;
};

export type LeafCompositionAcceptanceFail = {
  readonly ok: false;
  readonly outcome:
    | "VISUAL_NORMALIZE_FAILED"
    | "COMPOSITION_FAILED"
    | "AUTHORITY_INVALID";
  readonly reason: string;
  readonly compositionFailure?: CompositionFailure;
  readonly identity: LeafCompositionIdentity;
};

export type LeafCompositionAcceptanceResult =
  | LeafCompositionAcceptanceOk
  | LeafCompositionAcceptanceFail;

function sha256(bytes: Uint8Array | Buffer): string {
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}

export function buildStructuralEvidenceFromComposed(input: {
  readonly composed: ComposedDeliverable;
  readonly primaryMessage: string;
  readonly renderedTextProof?: StructuralArtifactEvidence["renderedTextProof"];
}): StructuralArtifactEvidence {
  return {
    compositionLayerEvidence: input.composed.layers,
    expectedRenderedTexts: [input.primaryMessage],
    canvasRequirement: {
      widthPx: input.composed.canvas.widthPx,
      heightPx: input.composed.canvas.heightPx,
    },
    canvasActual: {
      widthPx: input.composed.widthPx,
      heightPx: input.composed.heightPx,
      mimeType: input.composed.mimeType,
    },
    isFinalComposedDeliverable: true,
    hasPreviewAsset: true,
    onImageCopy: { headline: input.primaryMessage },
    ...(input.renderedTextProof
      ? { renderedTextProof: input.renderedTextProof }
      : {}),
  };
}

/**
 * Compose one leaf against shared authority and evaluate structural compliance.
 * OCR proof may be supplied by the caller (or omitted for composition-only checks).
 */
export function acceptComposedLeaf(input: {
  readonly authority: SharedCompositionAuthority;
  readonly visual: VisualGenerationResult | NormalizeLooseVisual;
  readonly identity?: LeafCompositionIdentity;
  readonly renderedTextProof?: StructuralArtifactEvidence["renderedTextProof"];
  /** When true, skip structural evaluation (caller evaluates later with OCR). */
  readonly skipStructural?: boolean;
}): LeafCompositionAcceptanceResult {
  const identity = input.identity ?? {};

  let visual: VisualGenerationResult;
  const candidate = input.visual as VisualGenerationResult & NormalizeLooseVisual;
  if (
    candidate.provenance === "generated" ||
    candidate.provenance === "fixture" ||
    candidate.provenance === "diagnostic"
  ) {
    visual = {
      bytes: candidate.bytes,
      mimeType: candidate.mimeType,
      widthPx: candidate.widthPx,
      heightPx: candidate.heightPx,
      provenance: candidate.provenance,
      generationMeta: {
        ...(candidate.generationMeta ?? {}),
        ...identity,
      },
    };
  } else {
    const n = normalizeVisualGenerationResult({
      bytes: candidate.bytes,
      mimeType: candidate.mimeType,
      widthPx: candidate.widthPx,
      heightPx: candidate.heightPx,
      provenance: "generated",
      generationMeta: {
        ...(candidate.generationMeta ?? {}),
        ...identity,
      },
    });
    if ("ok" in n && n.ok === false) {
      return {
        ok: false,
        outcome: "VISUAL_NORMALIZE_FAILED",
        reason: n.reason,
        identity,
      };
    }
    visual = n as VisualGenerationResult;
  }

  const compositionInput = buildCommunicationCompositionInput({
    authority: input.authority,
    visual,
  });
  const composed = composeDeliverable(compositionInput);
  if (!composed.ok) {
    return {
      ok: false,
      outcome: "COMPOSITION_FAILED",
      reason: composed.message,
      compositionFailure: composed,
      identity,
    };
  }

  if (!composedDiffersFromVisualPlate(composed)) {
    return {
      ok: false,
      outcome: "COMPOSITION_FAILED",
      reason: "composed_bytes_identical_to_raw_visual_plate",
      identity,
    };
  }

  const evidence = buildStructuralEvidenceFromComposed({
    composed,
    primaryMessage: input.authority.primaryMessage,
    renderedTextProof: input.renderedTextProof,
  });

  if (input.skipStructural) {
    return {
      ok: true,
      outcome: "COMPOSED_ACCEPTED",
      composed,
      structural: {
        status: "COMPLIANT",
        deliverableKind: input.authority.contract.kind,
        criteria: [],
        failedRequirements: [],
        blocksCanonicalCompletion: false,
        hasDeclaredOnlyEvidence: false,
        verificationRequirementsApplied: false,
      },
      evidence,
      identity,
      visualSourceHash: composed.sourceVisualHash,
      composedHash: composed.contentHash,
    };
  }

  const vreqs = deriveVisualVerificationRequirements(input.authority.contract);
  const structural = evaluateStructuralCompositionCompliance({
    contract: input.authority.contract,
    evidence,
    verificationRequirements: vreqs,
  });

  return {
    ok: true,
    outcome:
      structural.status === "COMPLIANT" && !structural.blocksCanonicalCompletion
        ? "COMPOSED_ACCEPTED"
        : "COMPOSED_REJECTED",
    composed,
    structural,
    evidence,
    identity,
    visualSourceHash: composed.sourceVisualHash,
    composedHash: composed.contentHash,
  };
}

type NormalizeLooseVisual = {
  readonly bytes: Uint8Array | Buffer;
  readonly mimeType?: string;
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly provenance?: VisualGenerationResult["provenance"];
  readonly generationMeta?: Readonly<Record<string, unknown>>;
};

/** Enrich a structured ingest candidate with composed deliverable pins. */
export function enrichCanonicalCandidateWithComposedDeliverable(input: {
  readonly baseCandidate: Record<string, unknown>;
  readonly composed: ComposedDeliverable;
  readonly vaultAssetId: string;
  readonly primaryMessage: string;
  readonly contract: DeliverableCompositionContract;
}): Record<string, unknown> {
  return {
    ...input.baseCandidate,
    previewAssetRef: {
      vaultAssetId: input.vaultAssetId,
      role: "creative_preview",
    },
    compositionLayerEvidence: input.composed.layers,
    canvasRequirement: {
      widthPx: input.composed.canvas.widthPx,
      heightPx: input.composed.canvas.heightPx,
    },
    canvasActual: {
      widthPx: input.composed.widthPx,
      heightPx: input.composed.heightPx,
      mimeType: input.composed.mimeType,
    },
    isFinalComposedDeliverable: true,
    expectedRenderedTexts: [input.primaryMessage],
    onImageCopy: {
      headline: input.primaryMessage,
      provenance: "user_provided",
    },
    composedContentHash: input.composed.contentHash,
    sourceVisualHash: input.composed.sourceVisualHash,
    deliverableKind: input.contract.kind,
  };
}

export function hashBuffer(bytes: Uint8Array | Buffer): string {
  return sha256(bytes);
}
