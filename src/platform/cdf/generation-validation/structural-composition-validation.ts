/**
 * Structural composition validation against DeliverableCompositionContract.
 *
 * Proof vocabulary:
 * - verified — pixel/OCR/vision evidence
 * - declared — artifact metadata claims (not pixel-proven)
 * - absent — required evidence missing
 * - unverifiable — no evaluator / producer available
 * - contract_declared — property on the composition contract (≠ artifact verified)
 *
 * Acceptance uses structured criterion fields (verificationClass,
 * acceptanceOnUnmet) — never criterion-name substring matching.
 */

import type { DeliverableCompositionContract } from "../../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";
import type {
  VisualVerificationClass,
  VisualVerificationCriterion,
  VisualVerificationCriterionId,
  VisualVerificationRequirements,
  CriterionAcceptanceOnUnmet,
  RenderedTextMatchPolicy,
} from "./visual-verification-requirements";
import { applyRenderedTextMatchPolicy } from "./visual-verification-requirements";

export type StructuralComplianceStatus =
  | "COMPLIANT"
  | "NON_COMPLIANT"
  | "UNVERIFIABLE";

export type StructuralProofLevel =
  | "verified"
  | "declared"
  | "absent"
  | "unverifiable"
  | "contract_declared";

export type StructuralCriterionResult = {
  /** Display / debug id (not used for acceptance policy). */
  readonly criterion: string;
  readonly criterionId: VisualVerificationCriterionId | "contract_shape";
  readonly verificationClass: VisualVerificationClass;
  readonly required: boolean;
  readonly acceptanceOnUnmet: CriterionAcceptanceOnUnmet;
  readonly status: StructuralComplianceStatus;
  readonly proofLevel: StructuralProofLevel;
  readonly evidence: string;
};

export type StructuralValidationResult = {
  readonly status: StructuralComplianceStatus;
  readonly deliverableKind: string | null;
  readonly criteria: readonly StructuralCriterionResult[];
  readonly failedRequirements: readonly string[];
  readonly blocksCanonicalCompletion: boolean;
  readonly hasDeclaredOnlyEvidence: boolean;
  readonly verificationRequirementsApplied: boolean;
};

export type StructuralArtifactEvidence = {
  readonly onImageCopy?: {
    readonly headline?: string | null;
    readonly messageAngle?: string | null;
  } | null;
  readonly hasPreviewAsset?: boolean;
  readonly structuredFields?: Readonly<
    Record<string, string | null | undefined>
  >;
  readonly renderedTextProof?: {
    readonly extractedText?: string | null;
    readonly source?: "ocr" | "vision" | "none";
    readonly outcome?:
      | "ok"
      | "artifact_unavailable"
      | "producer_unavailable"
      | "error";
    readonly confidence?: number;
    readonly language?: string;
    readonly failureReason?: string;
  } | null;
  readonly expectedRenderedTexts?: readonly string[];
  /**
   * Deterministic composition-layer evidence (generic).
   * Satisfies brand/visual/layout criteria when layers are rendered.
   */
  readonly compositionLayerEvidence?: readonly {
    readonly element: string;
    readonly realization: "generated" | "deterministic";
    readonly required: boolean;
    readonly rendered: boolean;
    readonly layerRole: string;
    readonly source: string;
    readonly sourceProvenance?: string;
    readonly bounds?: {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    };
    readonly text?: string;
    readonly textHash?: string;
    readonly insideSafeArea?: boolean;
  }[];
  /** Technical canvas requirement + actual measurements. */
  readonly canvasRequirement?: {
    readonly widthPx: number;
    readonly heightPx: number;
  };
  readonly canvasActual?: {
    readonly widthPx?: number;
    readonly heightPx?: number;
    readonly mimeType?: string;
  };
  /** When true, raw provider visual must not be treated as acceptance subject. */
  readonly isFinalComposedDeliverable?: boolean;
};

function nonEmpty(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

function hasDeclaredTextSurface(evidence: StructuralArtifactEvidence): boolean {
  if (nonEmpty(evidence.onImageCopy?.headline)) return true;
  if (nonEmpty(evidence.onImageCopy?.messageAngle)) return true;
  const fields = evidence.structuredFields ?? {};
  for (const key of [
    "primaryMessage",
    "primary_message_surface",
    "headline",
    "onImageCopy",
    "message",
  ]) {
    if (nonEmpty(fields[key])) return true;
  }
  return false;
}

type RenderedProofState =
  | { readonly kind: "absent" }
  | {
      readonly kind: "producer_failed";
      readonly source: "ocr" | "vision";
      readonly reason: string;
    }
  | { readonly kind: "empty"; readonly source: "ocr" | "vision" }
  | {
      readonly kind: "present";
      readonly source: "ocr" | "vision";
      readonly text: string;
    };

function renderedProofState(
  evidence: StructuralArtifactEvidence,
): RenderedProofState {
  const proof = evidence.renderedTextProof;
  if (!proof || proof.source === "none") return { kind: "absent" };
  const source = proof.source === "vision" ? "vision" : "ocr";
  const outcome = (proof as { outcome?: string }).outcome;
  if (
    outcome === "artifact_unavailable" ||
    outcome === "producer_unavailable" ||
    outcome === "error"
  ) {
    return {
      kind: "producer_failed",
      source,
      reason:
        typeof (proof as { failureReason?: string }).failureReason === "string"
          ? String((proof as { failureReason?: string }).failureReason)
          : outcome,
    };
  }
  if (!nonEmpty(proof.extractedText)) return { kind: "empty", source };
  return {
    kind: "present",
    source,
    text: String(proof.extractedText),
  };
}

function resultBase(input: {
  readonly criterion: string;
  readonly criterionId: StructuralCriterionResult["criterionId"];
  readonly verificationClass: VisualVerificationClass;
  readonly required: boolean;
  readonly acceptanceOnUnmet: CriterionAcceptanceOnUnmet;
  readonly status: StructuralComplianceStatus;
  readonly proofLevel: StructuralProofLevel;
  readonly evidence: string;
}): StructuralCriterionResult {
  return Object.freeze(input);
}

function evaluatePresenceCriterion(input: {
  readonly evidence: StructuralArtifactEvidence;
  readonly req: VisualVerificationCriterion;
  /** Display id only — never used for acceptance policy. */
  readonly displayCriterion?: string;
}): StructuralCriterionResult {
  const proof = renderedProofState(input.evidence);
  const policy: RenderedTextMatchPolicy =
    input.req.textMatchPolicy ?? "presence_only";
  const criterion = input.displayCriterion ?? input.req.id;

  if (proof.kind === "present") {
    const outcome = applyRenderedTextMatchPolicy({
      policy,
      extractedText: proof.text,
      expectedTexts: [],
    });
    if (outcome === "presence_ok" || outcome === "matched") {
      return resultBase({
        criterion,
        criterionId: input.req.id,
        verificationClass: input.req.verificationClass,
        required: input.req.required,
        acceptanceOnUnmet: input.req.acceptanceOnUnmet,
        status: "COMPLIANT",
        proofLevel: "verified",
        evidence: `rendered text present via ${proof.source} (${proof.text.length} chars)`,
      });
    }
  }

  if (proof.kind === "producer_failed") {
    // Infrastructure / resolution failure — not content NON_COMPLIANT.
    return resultBase({
      criterion,
      criterionId: input.req.id,
      verificationClass: input.req.verificationClass,
      required: input.req.required,
      acceptanceOnUnmet: input.req.acceptanceOnUnmet,
      status: "UNVERIFIABLE",
      proofLevel: "unverifiable",
      evidence: `rendered text proof unavailable (${proof.reason})`,
    });
  }

  if (proof.kind === "empty" || proof.kind === "present") {
    // Affirmative negative: OCR/vision ran and did not show required text.
    return resultBase({
      criterion,
      criterionId: input.req.id,
      verificationClass: input.req.verificationClass,
      required: input.req.required,
      acceptanceOnUnmet: input.req.acceptanceOnUnmet,
      status: "NON_COMPLIANT",
      proofLevel: "verified",
      evidence: `rendered text proof empty via ${proof.source}`,
    });
  }

  if (hasDeclaredTextSurface(input.evidence)) {
    return resultBase({
      criterion,
      criterionId: input.req.id,
      verificationClass: input.req.verificationClass,
      required: input.req.required,
      acceptanceOnUnmet: input.req.acceptanceOnUnmet,
      status: "UNVERIFIABLE",
      proofLevel: "declared",
      evidence:
        "artifact metadata declares on-image/message text, but rendered on-asset text is not proven (no OCR/vision proof)",
    });
  }

  if (!input.req.required) {
    return resultBase({
      criterion,
      criterionId: input.req.id,
      verificationClass: input.req.verificationClass,
      required: false,
      acceptanceOnUnmet: input.req.acceptanceOnUnmet,
      status: "COMPLIANT",
      proofLevel: "contract_declared",
      evidence: "rendered text presence not required",
    });
  }

  return resultBase({
    criterion,
    criterionId: input.req.id,
    verificationClass: input.req.verificationClass,
    required: true,
    acceptanceOnUnmet: input.req.acceptanceOnUnmet,
    status: "NON_COMPLIANT",
    proofLevel: "absent",
    evidence:
      "required rendered text: no metadata text surface and no rendered text proof",
  });
}

function evaluateMatchCriterion(input: {
  readonly evidence: StructuralArtifactEvidence;
  readonly req: VisualVerificationCriterion;
  readonly displayCriterion?: string;
}): StructuralCriterionResult {
  const proof = renderedProofState(input.evidence);
  const expected = (input.evidence.expectedRenderedTexts ?? []).filter((t) =>
    nonEmpty(t),
  );
  const policy: RenderedTextMatchPolicy =
    input.req.textMatchPolicy ?? "normalized_containment";
  const criterion = input.displayCriterion ?? input.req.id;

  if (proof.kind === "absent") {
    if (hasDeclaredTextSurface(input.evidence)) {
      return resultBase({
        criterion,
        criterionId: input.req.id,
        verificationClass: input.req.verificationClass,
        required: input.req.required,
        acceptanceOnUnmet: input.req.acceptanceOnUnmet,
        status: "UNVERIFIABLE",
        proofLevel: "declared",
        evidence:
          "metadata declares message text; rendered match not proven without OCR/vision",
      });
    }
    return resultBase({
      criterion,
      criterionId: input.req.id,
      verificationClass: input.req.verificationClass,
      required: input.req.required,
      acceptanceOnUnmet: input.req.acceptanceOnUnmet,
      status: input.req.required ? "NON_COMPLIANT" : "UNVERIFIABLE",
      proofLevel: input.req.required ? "absent" : "unverifiable",
      evidence: "no rendered text proof for message match",
    });
  }

  if (proof.kind === "producer_failed") {
    return resultBase({
      criterion,
      criterionId: input.req.id,
      verificationClass: input.req.verificationClass,
      required: input.req.required,
      acceptanceOnUnmet: input.req.acceptanceOnUnmet,
      status: "UNVERIFIABLE",
      proofLevel: "unverifiable",
      evidence: `rendered text match unavailable (${proof.reason})`,
    });
  }

  if (proof.kind === "empty") {
    return resultBase({
      criterion,
      criterionId: input.req.id,
      verificationClass: input.req.verificationClass,
      required: input.req.required,
      acceptanceOnUnmet: input.req.acceptanceOnUnmet,
      status: "NON_COMPLIANT",
      proofLevel: "verified",
      evidence: `rendered text proof empty via ${proof.source}; cannot satisfy ${policy}`,
    });
  }

  const outcome = applyRenderedTextMatchPolicy({
    policy,
    extractedText: proof.text,
    expectedTexts: expected,
  });

  if (outcome === "unverifiable") {
    // Proof exists but expected messages absent — cannot claim match COMPLIANT.
    return resultBase({
      criterion,
      criterionId: input.req.id,
      verificationClass: input.req.verificationClass,
      required: input.req.required,
      acceptanceOnUnmet: input.req.acceptanceOnUnmet,
      status: "UNVERIFIABLE",
      proofLevel: "verified",
      evidence: `rendered text via ${proof.source} present, but no expected message supplied for ${policy} match`,
    });
  }
  if (outcome === "matched" || outcome === "presence_ok") {
    return resultBase({
      criterion,
      criterionId: input.req.id,
      verificationClass: input.req.verificationClass,
      required: input.req.required,
      acceptanceOnUnmet: input.req.acceptanceOnUnmet,
      status: "COMPLIANT",
      proofLevel: "verified",
      evidence: `rendered text via ${proof.source} satisfies ${policy}`,
    });
  }
  return resultBase({
    criterion,
    criterionId: input.req.id,
    verificationClass: input.req.verificationClass,
    required: input.req.required,
    acceptanceOnUnmet: input.req.acceptanceOnUnmet,
    status: "NON_COMPLIANT",
    proofLevel: "verified",
    evidence: `rendered text via ${proof.source} does not satisfy ${policy} against expected message(s)`,
  });
}

function evaluatePixelUnverifiable(input: {
  readonly req: VisualVerificationCriterion;
}): StructuralCriterionResult {
  return resultBase({
    criterion: input.req.id,
    criterionId: input.req.id,
    verificationClass: input.req.verificationClass,
    required: input.req.required,
    acceptanceOnUnmet: input.req.acceptanceOnUnmet,
    status: "UNVERIFIABLE",
    proofLevel: "unverifiable",
    evidence:
      "pixel-level structural check unavailable (no vision verification producer)",
  });
}

/**
 * Media-modality criteria (motion_subject / frame_sequence / media_existence).
 * Uses container/mime + preview presence — never invents COMPLIANT without evidence.
 */
function evaluateMediaModalityCriterion(input: {
  readonly evidence: StructuralArtifactEvidence;
  readonly req: VisualVerificationCriterion;
  readonly deliverableKind: string;
}): StructuralCriterionResult {
  const mime = (input.evidence.canvasActual?.mimeType ?? "").toLowerCase();
  const hasPreview = input.evidence.hasPreviewAsset === true;
  const layer = findCompositionLayer(
    input.evidence,
    input.req.relatedElements?.map(String) ?? [input.req.id],
  );

  if (input.req.id === "media_existence") {
    if (hasPreview || mime.startsWith("video/") || mime.startsWith("image/")) {
      const isVideoKind = input.deliverableKind === "video";
      if (isVideoKind && mime && !mime.startsWith("video/")) {
        return resultBase({
          criterion: input.req.id,
          criterionId: input.req.id,
          verificationClass: input.req.verificationClass,
          required: input.req.required,
          acceptanceOnUnmet: input.req.acceptanceOnUnmet,
          status: "NON_COMPLIANT",
          proofLevel: "measured",
          evidence: `video deliverable requires video/* mime; got ${mime}`,
        });
      }
      return resultBase({
        criterion: input.req.id,
        criterionId: input.req.id,
        verificationClass: input.req.verificationClass,
        required: input.req.required,
        acceptanceOnUnmet: input.req.acceptanceOnUnmet,
        status: "COMPLIANT",
        proofLevel: "measured",
        evidence: `media present mime=${mime || "unknown"} preview=${hasPreview}`,
      });
    }
    return resultBase({
      criterion: input.req.id,
      criterionId: input.req.id,
      verificationClass: input.req.verificationClass,
      required: input.req.required,
      acceptanceOnUnmet: input.req.acceptanceOnUnmet,
      status: "NON_COMPLIANT",
      proofLevel: "absent",
      evidence: "required media artifact missing (no preview / mime)",
    });
  }

  if (input.req.id === "motion_subject") {
    if (mime.startsWith("video/") || (hasPreview && input.deliverableKind === "video" && !mime.startsWith("image/"))) {
      return resultBase({
        criterion: input.req.id,
        criterionId: input.req.id,
        verificationClass: input.req.verificationClass,
        required: input.req.required,
        acceptanceOnUnmet: input.req.acceptanceOnUnmet,
        status: "COMPLIANT",
        proofLevel: "measured",
        evidence: `motion container evidence mime=${mime || "video-preview"}`,
      });
    }
    if (layer) {
      return resultBase({
        criterion: input.req.id,
        criterionId: input.req.id,
        verificationClass: input.req.verificationClass,
        required: input.req.required,
        acceptanceOnUnmet: input.req.acceptanceOnUnmet,
        status: "COMPLIANT",
        proofLevel: "composition_layer",
        evidence: `composition layer rendered for ${layer.element}`,
      });
    }
    if (mime.startsWith("image/")) {
      return resultBase({
        criterion: input.req.id,
        criterionId: input.req.id,
        verificationClass: input.req.verificationClass,
        required: input.req.required,
        acceptanceOnUnmet: input.req.acceptanceOnUnmet,
        status: "NON_COMPLIANT",
        proofLevel: "measured",
        evidence: "motion_subject cannot be satisfied by still image mime",
      });
    }
    return resultBase({
      criterion: input.req.id,
      criterionId: input.req.id,
      verificationClass: input.req.verificationClass,
      required: input.req.required,
      acceptanceOnUnmet: input.req.acceptanceOnUnmet,
      status: "UNVERIFIABLE",
      proofLevel: "unverifiable",
      evidence: "motion_subject: no video mime / composition layer evidence",
    });
  }

  // frame_sequence
  if (layer) {
    return resultBase({
      criterion: input.req.id,
      criterionId: input.req.id,
      verificationClass: input.req.verificationClass,
      required: input.req.required,
      acceptanceOnUnmet: input.req.acceptanceOnUnmet,
      status: "COMPLIANT",
      proofLevel: "composition_layer",
      evidence: `frame_sequence layer rendered`,
    });
  }
  if (hasPreview || mime.startsWith("image/") || mime.startsWith("application/pdf")) {
    return resultBase({
      criterion: input.req.id,
      criterionId: input.req.id,
      verificationClass: input.req.verificationClass,
      required: input.req.required,
      acceptanceOnUnmet: input.req.acceptanceOnUnmet,
      status: "COMPLIANT",
      proofLevel: "measured",
      evidence: `storyboard media present mime=${mime || "image-preview"}`,
    });
  }
  return resultBase({
    criterion: input.req.id,
    criterionId: input.req.id,
    verificationClass: input.req.verificationClass,
    required: input.req.required,
    acceptanceOnUnmet: input.req.acceptanceOnUnmet,
    status: "UNVERIFIABLE",
    proofLevel: "unverifiable",
    evidence: "frame_sequence: no sequence layer or image media evidence",
  });
}

function findCompositionLayer(
  evidence: StructuralArtifactEvidence,
  elements: readonly string[],
): NonNullable<
  StructuralArtifactEvidence["compositionLayerEvidence"]
>[number] | undefined {
  const layers = evidence.compositionLayerEvidence ?? [];
  return layers.find(
    (l) => elements.includes(l.element) && l.rendered === true,
  );
}

/**
 * Satisfy brand / visual / layout criteria via deterministic composition
 * layer evidence when present. Does not weaken OCR text rules.
 */
function evaluateCompositionLayerCriterion(input: {
  readonly evidence: StructuralArtifactEvidence;
  readonly req: VisualVerificationCriterion;
}): StructuralCriterionResult | null {
  const related =
    input.req.relatedElements?.map(String) ??
    (input.req.id === "hierarchy_realization"
      ? ["layout_zones", "message_hierarchy"]
      : [input.req.id]);

  const layer = findCompositionLayer(input.evidence, related);
  if (!layer) {
    // Brand required + deterministic expected: missing evidence is NON_COMPLIANT
    // when contract realization is deterministic — handled by caller via
    // absence of layer. Return null to fall through to UNVERIFIABLE for
    // vision-only path (legacy), except brand with required + no layer
    // when composition evidence array was supplied but empty for this element.
    if (
      input.req.verificationClass === "brand_identity" &&
      input.req.required &&
      Array.isArray(input.evidence.compositionLayerEvidence)
    ) {
      return resultBase({
        criterion: input.req.id,
        criterionId: input.req.id,
        verificationClass: input.req.verificationClass,
        required: input.req.required,
        acceptanceOnUnmet: input.req.acceptanceOnUnmet,
        status: "NON_COMPLIANT",
        proofLevel: "absent",
        evidence:
          "required brand identity: composition-layer evidence absent or not rendered",
      });
    }
    return null;
  }

  if (input.req.verificationClass === "brand_identity") {
    if (
      layer.realization !== "deterministic" ||
      layer.source !== "brand_asset"
    ) {
      return resultBase({
        criterion: input.req.id,
        criterionId: input.req.id,
        verificationClass: input.req.verificationClass,
        required: input.req.required,
        acceptanceOnUnmet: input.req.acceptanceOnUnmet,
        status: "NON_COMPLIANT",
        proofLevel: "verified",
        evidence:
          "brand layer present but not deterministic brand_asset realization",
      });
    }
    return resultBase({
      criterion: input.req.id,
      criterionId: input.req.id,
      verificationClass: input.req.verificationClass,
      required: input.req.required,
      acceptanceOnUnmet: input.req.acceptanceOnUnmet,
      status: "COMPLIANT",
      proofLevel: "verified",
      evidence: `composition-layer brand evidence: element=${layer.element}; source=${layer.source}`,
    });
  }

  if (input.req.verificationClass === "visual_subject") {
    return resultBase({
      criterion: input.req.id,
      criterionId: input.req.id,
      verificationClass: input.req.verificationClass,
      required: input.req.required,
      acceptanceOnUnmet: input.req.acceptanceOnUnmet,
      status: "COMPLIANT",
      proofLevel: "verified",
      evidence: `composition-layer visual plate evidence: realization=${layer.realization}`,
    });
  }

  if (input.req.verificationClass === "layout") {
    return resultBase({
      criterion: input.req.id,
      criterionId: input.req.id,
      verificationClass: input.req.verificationClass,
      required: input.req.required,
      acceptanceOnUnmet: input.req.acceptanceOnUnmet,
      status: "COMPLIANT",
      proofLevel: "verified",
      evidence: `composition-layer layout evidence: element=${layer.element}`,
    });
  }

  return null;
}

function evaluateCanvasCriterion(input: {
  readonly evidence: StructuralArtifactEvidence;
}): StructuralCriterionResult | null {
  const req = input.evidence.canvasRequirement;
  if (!req) return null;
  const actual = input.evidence.canvasActual;
  if (!actual || actual.widthPx == null || actual.heightPx == null) {
    return resultBase({
      criterion: "canvas_dimensions",
      criterionId: "canvas_dimensions",
      verificationClass: "technical",
      required: true,
      acceptanceOnUnmet: "block",
      status: "UNVERIFIABLE",
      proofLevel: "unverifiable",
      evidence: "canvas requirement present but actual dimensions unavailable",
    });
  }
  const ok =
    actual.widthPx === req.widthPx && actual.heightPx === req.heightPx;
  return resultBase({
    criterion: "canvas_dimensions",
    criterionId: "canvas_dimensions",
    verificationClass: "technical",
    required: true,
    acceptanceOnUnmet: "block",
    status: ok ? "COMPLIANT" : "NON_COMPLIANT",
    proofLevel: "verified",
    evidence: ok
      ? `canvas ${actual.widthPx}x${actual.heightPx} matches requirement`
      : `canvas ${actual.widthPx}x${actual.heightPx} != required ${req.widthPx}x${req.heightPx}`,
  });
}

/**
 * Derive blocksCanonicalCompletion from structured criterion fields only.
 */
export function deriveBlocksCanonicalCompletion(
  criteria: readonly StructuralCriterionResult[],
): boolean {
  return criteria.some((c) => {
    if (c.status === "NON_COMPLIANT" && c.acceptanceOnUnmet === "block") {
      return true;
    }
    if (c.status === "NON_COMPLIANT" && c.required) {
      // Affirmative absence/mismatch of a required criterion always blocks.
      return true;
    }
    if (c.status === "UNVERIFIABLE" && c.acceptanceOnUnmet === "block") {
      return true;
    }
    return false;
  });
}

/**
 * Evaluate structural compliance for a generated artifact against composition.
 */
export function evaluateStructuralCompositionCompliance(input: {
  readonly contract: DeliverableCompositionContract | null | undefined;
  readonly evidence: StructuralArtifactEvidence;
  readonly verificationRequirements?: VisualVerificationRequirements | null;
}): StructuralValidationResult {
  const contract = input.contract;
  const vreqs = input.verificationRequirements ?? null;

  if (!contract) {
    return {
      status: "COMPLIANT",
      deliverableKind: null,
      criteria: [],
      failedRequirements: [],
      blocksCanonicalCompletion: false,
      hasDeclaredOnlyEvidence: false,
      verificationRequirementsApplied: false,
    };
  }

  const criteria: StructuralCriterionResult[] = [];

  // Contract-shape criteria (not artifact pixel proof).
  if (contract.communicationMode) {
    criteria.push(
      resultBase({
        criterion: "communication_mode_present",
        criterionId: "contract_shape",
        verificationClass: "contract_shape",
        required: true,
        acceptanceOnUnmet: "block",
        status: "COMPLIANT",
        proofLevel: "contract_declared",
        evidence: `contract.communicationMode=${contract.communicationMode} (not pixel-verified)`,
      }),
    );
  } else {
    criteria.push(
      resultBase({
        criterion: "communication_mode_present",
        criterionId: "contract_shape",
        verificationClass: "contract_shape",
        required: true,
        acceptanceOnUnmet: "block",
        status: "NON_COMPLIANT",
        proofLevel: "absent",
        evidence: "missing communicationMode on contract",
      }),
    );
  }

  const hierarchyOk =
    Array.isArray(contract.hierarchy) && contract.hierarchy.length > 0;
  if (
    contract.completionCriteria.some((c) => c.type === "hierarchy_defined")
  ) {
    criteria.push(
      resultBase({
        criterion: "hierarchy_defined",
        criterionId: "contract_shape",
        verificationClass: "contract_shape",
        required: true,
        acceptanceOnUnmet: "block",
        status: hierarchyOk ? "COMPLIANT" : "NON_COMPLIANT",
        proofLevel: hierarchyOk ? "contract_declared" : "absent",
        evidence: hierarchyOk
          ? `contract.hierarchy roles=${contract.hierarchy!.length} (artifact hierarchy not pixel-verified)`
          : "hierarchy missing on contract",
      }),
    );
  }

  // Prefer structured verification requirements when provided.
  if (vreqs) {
    for (const req of vreqs.criteria) {
      if (req.id === "rendered_text_presence") {
        criteria.push(
          evaluatePresenceCriterion({ evidence: input.evidence, req }),
        );
      } else if (req.id === "rendered_text_match") {
        criteria.push(
          evaluateMatchCriterion({ evidence: input.evidence, req }),
        );
      } else if (
        req.id === "media_existence" ||
        req.id === "motion_subject" ||
        req.id === "frame_sequence"
      ) {
        criteria.push(
          evaluateMediaModalityCriterion({
            evidence: input.evidence,
            req,
            deliverableKind: contract.kind,
          }),
        );
      } else {
        const fromLayers = evaluateCompositionLayerCriterion({
          evidence: input.evidence,
          req,
        });
        if (fromLayers) {
          criteria.push(fromLayers);
        } else {
          criteria.push(evaluatePixelUnverifiable({ req }));
        }
      }
    }
  } else {
    // Legacy unit path (no vreqs): metadata-level checks; acceptance still
    // driven by structured fields, not criterion-name substrings.
    const textRequired = contract.textPolicy?.required === true;
    if (textRequired) {
      const syntheticPresence: VisualVerificationCriterion = {
        id: "rendered_text_presence",
        verificationClass: "rendered_text",
        required: true,
        acceptanceOnUnmet: "allow_with_hold",
        textMatchPolicy: "presence_only",
        satisfiedBy: Object.freeze([
          "OCR_TEXT_RECOGNITION",
          "VISION_IMAGE_ANALYSIS",
        ]),
      };
      criteria.push(
        evaluatePresenceCriterion({
          evidence: input.evidence,
          req: syntheticPresence,
          displayCriterion: "text_surface_when_required",
        }),
      );
    }
    for (const el of contract.requiredElements) {
      if (
        el === "primary_message_surface" ||
        el === "secondary_message_surface"
      ) {
        const synthetic: VisualVerificationCriterion = {
          id: "rendered_text_presence",
          verificationClass: "rendered_text",
          required: true,
          acceptanceOnUnmet: "allow_with_hold",
          textMatchPolicy: "presence_only",
          satisfiedBy: Object.freeze([
            "OCR_TEXT_RECOGNITION",
            "VISION_IMAGE_ANALYSIS",
          ]),
          relatedElements: Object.freeze([el]),
        };
        criteria.push(
          evaluatePresenceCriterion({
            evidence: input.evidence,
            req: synthetic,
            displayCriterion: `required_element:${el}`,
          }),
        );
      } else if (
        el === "visual_subject" ||
        el === "brand_signature" ||
        el === "identity_mark"
      ) {
        const synthetic: VisualVerificationCriterion = {
          id: el === "visual_subject" ? "visual_subject" : "brand_signature",
          verificationClass:
            el === "visual_subject" ? "visual_subject" : "brand_identity",
          required: true,
          acceptanceOnUnmet: "allow_with_hold",
          satisfiedBy: Object.freeze([
            "COMPOSITION_LAYER_EVIDENCE",
            "VISION_IMAGE_ANALYSIS",
            "VISION_BRAND_MARK_DETECTION",
          ]),
          relatedElements: Object.freeze([el]),
        };
        const fromLayers = evaluateCompositionLayerCriterion({
          evidence: input.evidence,
          req: synthetic,
        });
        if (fromLayers) {
          criteria.push({
            ...fromLayers,
            criterion: `required_element:${el}`,
          });
        } else {
          criteria.push(
            resultBase({
              criterion: `required_element:${el}`,
              criterionId:
                el === "visual_subject" ? "visual_subject" : "brand_signature",
              verificationClass:
                el === "visual_subject" ? "visual_subject" : "brand_identity",
              required: true,
              acceptanceOnUnmet: "allow_with_hold",
              status: "UNVERIFIABLE",
              proofLevel: "unverifiable",
              evidence:
                "pixel-level structural check unavailable (no vision verification producer)",
            }),
          );
        }
      }
    }
  }

  const canvasCriterion = evaluateCanvasCriterion({ evidence: input.evidence });
  if (canvasCriterion) criteria.push(canvasCriterion);

  const failed = criteria
    .filter((x) => x.status === "NON_COMPLIANT")
    .map((x) => x.criterion);
  // Optional (required:false) UNVERIFIABLE must not poison overall COMPLIANT.
  const hasRequiredUnverifiable = criteria.some(
    (x) => x.status === "UNVERIFIABLE" && x.required,
  );

  let status: StructuralComplianceStatus;
  if (failed.length > 0) status = "NON_COMPLIANT";
  else if (hasRequiredUnverifiable) status = "UNVERIFIABLE";
  else status = "COMPLIANT";

  return {
    status,
    deliverableKind: contract.kind,
    criteria: Object.freeze(criteria),
    failedRequirements: Object.freeze(failed),
    blocksCanonicalCompletion: deriveBlocksCanonicalCompletion(criteria),
    hasDeclaredOnlyEvidence: criteria.some(
      (x) => x.proofLevel === "declared",
    ),
    verificationRequirementsApplied: vreqs != null,
  };
}

export function extractStructuralEvidenceFromCandidate(
  candidate: unknown,
): StructuralArtifactEvidence {
  if (!candidate || typeof candidate !== "object") {
    return { hasPreviewAsset: false };
  }
  const root = candidate as Record<string, unknown>;
  const onImageCopy = root.onImageCopy;
  let copy: StructuralArtifactEvidence["onImageCopy"] = null;
  if (onImageCopy && typeof onImageCopy === "object") {
    const o = onImageCopy as Record<string, unknown>;
    copy = {
      headline: typeof o.headline === "string" ? o.headline : null,
      messageAngle: typeof o.messageAngle === "string" ? o.messageAngle : null,
    };
  }
  const preview = root.previewAssetRef;
  const hasPreviewAsset =
    preview != null &&
    typeof preview === "object" &&
    typeof (preview as Record<string, unknown>).vaultAssetId === "string";

  const structuredFields: Record<string, string | null | undefined> = {};
  for (const key of [
    "primaryMessage",
    "headline",
    "message",
    "compositionNotes",
  ]) {
    const v = root[key];
    if (typeof v === "string") structuredFields[key] = v;
  }

  let renderedTextProof: StructuralArtifactEvidence["renderedTextProof"] = null;
  const rtp = root.renderedTextProof;
  if (rtp && typeof rtp === "object") {
    const r = rtp as Record<string, unknown>;
    const outcome =
      r.outcome === "ok" ||
      r.outcome === "artifact_unavailable" ||
      r.outcome === "producer_unavailable" ||
      r.outcome === "error"
        ? r.outcome
        : undefined;
    renderedTextProof = {
      extractedText: typeof r.extractedText === "string" ? r.extractedText : null,
      source:
        r.source === "ocr" || r.source === "vision" || r.source === "none"
          ? r.source
          : "none",
      ...(outcome ? { outcome } : {}),
      ...(typeof r.confidence === "number" ? { confidence: r.confidence } : {}),
      ...(typeof r.language === "string" ? { language: r.language } : {}),
      ...(typeof r.failureReason === "string"
        ? { failureReason: r.failureReason }
        : {}),
    };
  }

  let expectedRenderedTexts: string[] | undefined;
  const expected = root.expectedRenderedTexts;
  if (Array.isArray(expected)) {
    expectedRenderedTexts = expected.filter(
      (t): t is string => typeof t === "string" && t.trim().length > 0,
    );
  }

  let compositionLayerEvidence:
    | StructuralArtifactEvidence["compositionLayerEvidence"]
    | undefined;
  if (Array.isArray(root.compositionLayerEvidence)) {
    compositionLayerEvidence =
      root.compositionLayerEvidence as StructuralArtifactEvidence["compositionLayerEvidence"];
  }

  let canvasRequirement: StructuralArtifactEvidence["canvasRequirement"];
  if (root.canvasRequirement && typeof root.canvasRequirement === "object") {
    const c = root.canvasRequirement as Record<string, unknown>;
    if (typeof c.widthPx === "number" && typeof c.heightPx === "number") {
      canvasRequirement = { widthPx: c.widthPx, heightPx: c.heightPx };
    }
  }

  let canvasActual: StructuralArtifactEvidence["canvasActual"];
  if (root.canvasActual && typeof root.canvasActual === "object") {
    const c = root.canvasActual as Record<string, unknown>;
    canvasActual = {
      widthPx: typeof c.widthPx === "number" ? c.widthPx : undefined,
      heightPx: typeof c.heightPx === "number" ? c.heightPx : undefined,
      mimeType: typeof c.mimeType === "string" ? c.mimeType : undefined,
    };
  }

  return {
    onImageCopy: copy,
    hasPreviewAsset,
    structuredFields,
    renderedTextProof,
    ...(expectedRenderedTexts ? { expectedRenderedTexts } : {}),
    ...(compositionLayerEvidence ? { compositionLayerEvidence } : {}),
    ...(canvasRequirement ? { canvasRequirement } : {}),
    ...(canvasActual ? { canvasActual } : {}),
    ...(root.isFinalComposedDeliverable === true
      ? { isFinalComposedDeliverable: true }
      : {}),
  };
}

function pushUniqueTrimmed(out: string[], value: unknown): void {
  if (typeof value !== "string") return;
  const t = value.trim();
  if (!t || out.includes(t)) return;
  out.push(t);
}

/**
 * Resolved required-rendered-communication texts from CMR
 * `deliverable_composition` (authoritative on-asset expectation plane).
 */
export function expectedTextsFromCanonicalModelRequest(
  cmr: unknown,
): string[] {
  if (!cmr || typeof cmr !== "object") return [];
  const messages = (cmr as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) return [];
  const out: string[] = [];
  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;
    const content = (msg as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const p = part as { name?: unknown; data?: unknown };
      if (p.name !== "deliverable_composition") continue;
      if (!p.data || typeof p.data !== "object") continue;
      const rrc = (p.data as { requiredRenderedCommunication?: unknown })
        .requiredRenderedCommunication;
      if (!rrc || typeof rrc !== "object") continue;
      const surfaces = (rrc as { surfaces?: unknown }).surfaces;
      if (!Array.isArray(surfaces)) continue;
      for (const surface of surfaces) {
        if (!surface || typeof surface !== "object") continue;
        const s = surface as {
          resolutionStatus?: unknown;
          required?: unknown;
          text?: unknown;
          provenance?: unknown;
        };
        if (s.resolutionStatus === "unresolved") continue;
        if (s.required === false) continue;
        // Only an authoritative direction-declared message is a verbatim
        // on-asset string. A conversational instruction guides generation but
        // is not an exact OCR requirement.
        if (
          typeof s.provenance === "string" &&
          s.provenance !== "selected_semantic_direction"
        ) {
          continue;
        }
        pushUniqueTrimmed(out, s.text);
      }
    }
  }
  return out;
}

export function expectedTextsFromExecutionMetadata(
  meta: Record<string, unknown> | undefined,
): string[] {
  if (!meta) return [];
  const out: string[] = [];
  const direct = meta.cdfExpectedOnAssetTexts;
  if (Array.isArray(direct)) {
    for (const t of direct) {
      pushUniqueTrimmed(out, t);
    }
  }
  pushUniqueTrimmed(out, meta.cdfSelectedPrimaryMessage);
  pushUniqueTrimmed(out, meta.cdfSelectedHeadlineAngle);
  // Production acceptance must use the same RRC values that were compiled into
  // CMR / flattened to the provider — not only optional selection stamps.
  for (const t of expectedTextsFromCanonicalModelRequest(
    meta.canonicalModelRequest,
  )) {
    pushUniqueTrimmed(out, t);
  }
  return out;
}

/** Cap OCR text retained in observational diagnostics (not acceptance). */
const MAX_DIAGNOSTIC_EXTRACTED_TEXT_CHARS = 4_000;

/**
 * Observational structural/OCR evidence for execution/job diagnostics.
 * Must never be treated as an acceptance authority — acceptance remains
 * artifact → structural verification → structural evaluation → canonical decision.
 */
export type StructuralVerificationDiagnostics = {
  readonly status: StructuralComplianceStatus;
  readonly overallStructuralVerdict: StructuralComplianceStatus;
  readonly deliverableKind: string | null;
  readonly failedRequirements: readonly string[];
  readonly failedRequirementIds: readonly string[];
  readonly criteria: readonly StructuralCriterionResult[];
  readonly hasDeclaredOnlyEvidence: boolean;
  readonly blocksCanonicalCompletion: boolean;
  readonly blockingDecision: boolean;
  readonly verificationRequirementsApplied: boolean;
  readonly requiresRenderedTextProof: boolean;
  readonly renderedTextProofPresent: boolean;
  readonly expectedRenderedTextCount: number;
  readonly expectedRenderedTexts: readonly string[];
  readonly ocrExecuted: boolean;
  readonly ocrOutcome: string | null;
  readonly ocrSource: "ocr" | "vision" | "none" | null;
  readonly extractedText: string | null;
  readonly ocrConfidence: number | null;
  readonly ocrFailureReason: string | null;
  readonly renderedTextPresenceVerdict: StructuralComplianceStatus | null;
  readonly renderedTextMatchVerdict: StructuralComplianceStatus | null;
  readonly canonicalIngestDecision: "blocked" | "eligible";
  readonly provider: string | null;
  readonly model: string | null;
  readonly executionId: string;
  readonly proofBoundary: string;
  readonly gateException?: boolean;
  /** Explicit: diagnostics are observational only. */
  readonly diagnosticAuthority: "observational";
};

function criterionVerdict(
  criteria: readonly StructuralCriterionResult[],
  criterionId: VisualVerificationCriterionId,
): StructuralComplianceStatus | null {
  const hit = criteria.find((c) => c.criterionId === criterionId);
  return hit ? hit.status : null;
}

function truncateDiagnosticText(text: string | null | undefined): string | null {
  if (typeof text !== "string") return null;
  if (text.length <= MAX_DIAGNOSTIC_EXTRACTED_TEXT_CHARS) return text;
  return `${text.slice(0, MAX_DIAGNOSTIC_EXTRACTED_TEXT_CHARS)}…`;
}

function asOptionalId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Build forensic structural/OCR diagnostics from the same evaluation result
 * that drove acceptance — no second OCR pass, no second acceptance path.
 */
export function buildStructuralVerificationDiagnostics(input: {
  readonly structural: StructuralValidationResult;
  readonly evidence: StructuralArtifactEvidence;
  readonly executionId: string;
  readonly providerId?: unknown;
  readonly modelId?: unknown;
  readonly requiresRenderedTextProof?: boolean;
  readonly gateException?: boolean;
}): StructuralVerificationDiagnostics {
  const proof = input.evidence.renderedTextProof ?? null;
  const source =
    proof?.source === "ocr" || proof?.source === "vision" || proof?.source === "none"
      ? proof.source
      : null;
  const ocrExecuted = Boolean(proof && source && source !== "none");
  const outcomeRaw =
    proof && typeof (proof as { outcome?: unknown }).outcome === "string"
      ? String((proof as { outcome: string }).outcome)
      : null;
  const ocrOutcome = ocrExecuted
    ? outcomeRaw ??
      (nonEmpty(proof?.extractedText) ? "ok" : "empty_or_unspecified")
    : null;
  const expected = Object.freeze(
    [...(input.evidence.expectedRenderedTexts ?? [])].map((t) => String(t)),
  );
  const blocked = input.structural.blocksCanonicalCompletion === true;

  return Object.freeze({
    status: input.structural.status,
    overallStructuralVerdict: input.structural.status,
    deliverableKind: input.structural.deliverableKind,
    failedRequirements: input.structural.failedRequirements,
    failedRequirementIds: input.structural.failedRequirements,
    criteria: input.structural.criteria,
    hasDeclaredOnlyEvidence: input.structural.hasDeclaredOnlyEvidence,
    blocksCanonicalCompletion: blocked,
    blockingDecision: blocked,
    verificationRequirementsApplied:
      input.structural.verificationRequirementsApplied,
    requiresRenderedTextProof: input.requiresRenderedTextProof ?? false,
    renderedTextProofPresent: Boolean(proof),
    expectedRenderedTextCount: expected.length,
    expectedRenderedTexts: expected,
    ocrExecuted,
    ocrOutcome,
    ocrSource: source,
    extractedText: truncateDiagnosticText(proof?.extractedText ?? null),
    ocrConfidence:
      typeof proof?.confidence === "number" && Number.isFinite(proof.confidence)
        ? proof.confidence
        : null,
    ocrFailureReason:
      typeof (proof as { failureReason?: unknown } | null)?.failureReason ===
      "string"
        ? String(
            (proof as { failureReason: string }).failureReason,
          ).slice(0, 400)
        : null,
    renderedTextPresenceVerdict: criterionVerdict(
      input.structural.criteria,
      "rendered_text_presence",
    ),
    renderedTextMatchVerdict: criterionVerdict(
      input.structural.criteria,
      "rendered_text_match",
    ),
    canonicalIngestDecision: blocked ? "blocked" : "eligible",
    provider: asOptionalId(input.providerId),
    model: asOptionalId(input.modelId),
    executionId: input.executionId,
    proofBoundary: proof
      ? `rendered_text_${source ?? "unknown"}`
      : "metadata_only_without_ocr",
    ...(input.gateException ? { gateException: true as const } : {}),
    diagnosticAuthority: "observational" as const,
  });
}

/** Existing metadata convention keys for structural diagnostics. */
export function structuralVerificationMetadataStamps(
  diagnostics: StructuralVerificationDiagnostics,
): Record<string, unknown> {
  return {
    cdfStructuralComplianceStatus: diagnostics.status,
    cdfStructuralCompliance: diagnostics,
  };
}
