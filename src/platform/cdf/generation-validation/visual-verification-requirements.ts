/**
 * Composition → visual verification requirements.
 * Generic — no service / phase / platform / provider branches.
 *
 * Distinguishes generation capabilities from verification capabilities.
 * Acceptance policy is structural (per-criterion), not string-name based.
 */

import type { DeliverableCompositionContract } from "../../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";
import type { DeliverableElementId } from "../../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";
import { requiredExactRenderedCommunicationElements } from "../../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";

/** Verification capability ids — distinct from image generation capabilities. */
export type VisualVerificationCapabilityId =
  | "OCR_TEXT_RECOGNITION"
  | "VISION_IMAGE_ANALYSIS"
  | "VISION_LAYOUT_ANALYSIS"
  | "VISION_BRAND_MARK_DETECTION"
  | "COMPOSITION_LAYER_EVIDENCE"
  | "MEDIA_CONTAINER_EVIDENCE";

export type VisualVerificationCriterionId =
  | "rendered_text_presence"
  | "rendered_text_match"
  | "visual_subject"
  | "brand_signature"
  | "identity_mark"
  | "hierarchy_realization"
  | "communication_mode_realization"
  | "canvas_dimensions"
  | "motion_subject"
  | "frame_sequence"
  | "media_existence";

/** Structured class used by acceptance — never inferred from criterion name strings. */
export type VisualVerificationClass =
  | "rendered_text"
  | "visual_subject"
  | "brand_identity"
  | "layout"
  | "communication_mode"
  | "contract_shape"
  | "technical"
  | "motion"
  | "sequence";

/**
 * How unmet (UNVERIFIABLE or NON_COMPLIANT) results affect canonical acceptance.
 * Separated from `required` so a criterion can be required for overall COMPLIANT
 * without blocking acceptance while a producer is unavailable.
 */
export type CriterionAcceptanceOnUnmet = "block" | "allow_with_hold";

/**
 * Declarative text-match policy when OCR/vision proof is present.
 * `semantic` is unavailable until an evaluator producer exists.
 */
export type RenderedTextMatchPolicy =
  | "presence_only"
  | "normalized_containment"
  | "unavailable";

export type VisualVerificationCriterion = {
  readonly id: VisualVerificationCriterionId;
  readonly verificationClass: VisualVerificationClass;
  readonly required: boolean;
  readonly acceptanceOnUnmet: CriterionAcceptanceOnUnmet;
  /** Which verification capabilities can satisfy this criterion. */
  readonly satisfiedBy: readonly VisualVerificationCapabilityId[];
  readonly relatedElements?: readonly DeliverableElementId[];
  /** Only for rendered_text class. */
  readonly textMatchPolicy?: RenderedTextMatchPolicy;
};

export type VisualVerificationRequirements = {
  readonly criteria: readonly VisualVerificationCriterion[];
  /** Convenience: any criterion has verificationClass rendered_text + required. */
  readonly requiresRenderedTextProof: boolean;
  readonly derivedFrom: {
    readonly deliverableKind: string;
    readonly textPolicyRequired: boolean;
    readonly textPlacement: string | null;
    readonly hierarchyDefined: boolean;
    readonly subjectRequired: boolean;
    readonly brandMarkRole: string | null;
  };
};

const ON_ASSET = new Set(["on_asset", "optional_on_asset"]);

/**
 * Derive verification requirements from DeliverableCompositionContract.
 */
export function deriveVisualVerificationRequirements(
  contract: DeliverableCompositionContract | null | undefined,
): VisualVerificationRequirements | null {
  if (!contract) return null;

  const textRequired = contract.textPolicy?.required === true;
  const placement = contract.textPolicy?.placement ?? null;
  const requiresRenderedTextProof =
    textRequired && placement != null && ON_ASSET.has(placement);

  const criteria: VisualVerificationCriterion[] = [];

  if (requiresRenderedTextProof) {
    criteria.push({
      id: "rendered_text_presence",
      verificationClass: "rendered_text",
      required: true,
      acceptanceOnUnmet: "block",
      textMatchPolicy: "presence_only",
      satisfiedBy: Object.freeze([
        "OCR_TEXT_RECOGNITION",
        "VISION_IMAGE_ANALYSIS",
      ]),
      relatedElements: Object.freeze([
        "primary_message_surface",
        "secondary_message_surface",
      ] as DeliverableElementId[]),
    });
    // Exact-match only exists for elements declaring an authoritative exact
    // message; model_authored text is verified by presence, never by a string
    // invented from prompts.
    const exactElements = requiredExactRenderedCommunicationElements(contract);
    if (exactElements.length > 0) {
      criteria.push({
        id: "rendered_text_match",
        verificationClass: "rendered_text",
        required: true,
        // NON_COMPLIANT mismatch still blocks via required; UNVERIFIABLE
        // (e.g. no expected message supplied) holds without blocking presence.
        acceptanceOnUnmet: "allow_with_hold",
        // Match only when expected messages are supplied; otherwise UNVERIFIABLE.
        textMatchPolicy: "normalized_containment",
        satisfiedBy: Object.freeze([
          "OCR_TEXT_RECOGNITION",
          "VISION_IMAGE_ANALYSIS",
        ]),
        relatedElements: Object.freeze([...exactElements]),
      });
    }
  }

  if (contract.visualPolicy?.subjectRequired) {
    criteria.push({
      id: "visual_subject",
      verificationClass: "visual_subject",
      required: true,
      // Required for overall COMPLIANT, but do not block while vision is undeclared.
      acceptanceOnUnmet: "allow_with_hold",
      satisfiedBy: Object.freeze([
        "VISION_IMAGE_ANALYSIS",
        "COMPOSITION_LAYER_EVIDENCE",
      ]),
      relatedElements: Object.freeze([
        "visual_subject",
      ] as DeliverableElementId[]),
    });
  }

  const brandRole = contract.brandIntegration?.markRole ?? null;
  if (
    brandRole === "signature" ||
    brandRole === "secondary" ||
    brandRole === "primary" ||
    contract.requiredElements.includes("brand_signature") ||
    contract.requiredElements.includes("identity_mark")
  ) {
    criteria.push({
      id: "brand_signature",
      verificationClass: "brand_identity",
      required: true,
      acceptanceOnUnmet: "allow_with_hold",
      satisfiedBy: Object.freeze([
        "VISION_BRAND_MARK_DETECTION",
        "VISION_IMAGE_ANALYSIS",
        "COMPOSITION_LAYER_EVIDENCE",
      ]),
      relatedElements: Object.freeze([
        "brand_signature",
        "identity_mark",
      ] as DeliverableElementId[]),
    });
  }

  if (Array.isArray(contract.hierarchy) && contract.hierarchy.length > 0) {
    criteria.push({
      id: "hierarchy_realization",
      verificationClass: "layout",
      required: false,
      acceptanceOnUnmet: "allow_with_hold",
      satisfiedBy: Object.freeze([
        "VISION_LAYOUT_ANALYSIS",
        "VISION_IMAGE_ANALYSIS",
        "COMPOSITION_LAYER_EVIDENCE",
      ]),
    });
  }

  if (contract.requiredElements.includes("motion_subject")) {
    criteria.push({
      id: "motion_subject",
      verificationClass: "motion",
      required: true,
      // Technical mime/container proof can satisfy; vision motion analysis may be absent.
      acceptanceOnUnmet: "allow_with_hold",
      satisfiedBy: Object.freeze([
        "MEDIA_CONTAINER_EVIDENCE",
        "COMPOSITION_LAYER_EVIDENCE",
      ]),
      relatedElements: Object.freeze([
        "motion_subject",
      ] as DeliverableElementId[]),
    });
    criteria.push({
      id: "media_existence",
      verificationClass: "technical",
      required: true,
      acceptanceOnUnmet: "block",
      satisfiedBy: Object.freeze(["MEDIA_CONTAINER_EVIDENCE"]),
      relatedElements: Object.freeze([
        "motion_subject",
      ] as DeliverableElementId[]),
    });
  }

  if (contract.requiredElements.includes("frame_sequence")) {
    criteria.push({
      id: "frame_sequence",
      verificationClass: "sequence",
      required: true,
      acceptanceOnUnmet: "allow_with_hold",
      satisfiedBy: Object.freeze([
        "COMPOSITION_LAYER_EVIDENCE",
        "VISION_LAYOUT_ANALYSIS",
        "MEDIA_CONTAINER_EVIDENCE",
      ]),
      relatedElements: Object.freeze([
        "frame_sequence",
      ] as DeliverableElementId[]),
    });
  }

  return Object.freeze({
    criteria: Object.freeze(criteria),
    requiresRenderedTextProof,
    derivedFrom: Object.freeze({
      deliverableKind: contract.kind,
      textPolicyRequired: textRequired,
      textPlacement: placement,
      hierarchyDefined:
        Array.isArray(contract.hierarchy) && contract.hierarchy.length > 0,
      subjectRequired: contract.visualPolicy?.subjectRequired === true,
      brandMarkRole: brandRole,
    }),
  });
}

/** Lookup a derived criterion by id. */
export function findVerificationCriterion(
  requirements: VisualVerificationRequirements | null | undefined,
  id: VisualVerificationCriterionId,
): VisualVerificationCriterion | undefined {
  return requirements?.criteria.find((c) => c.id === id);
}

/** Normalize for normalized_containment matching. */
export function normalizeVerificationText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Apply declarative textMatchPolicy against extracted vs expected text.
 * `semantic` / unavailable policies must not invent equivalence.
 */
export function applyRenderedTextMatchPolicy(input: {
  readonly policy: RenderedTextMatchPolicy;
  readonly extractedText: string;
  readonly expectedTexts: readonly string[];
}): "matched" | "mismatched" | "presence_ok" | "unverifiable" {
  if (input.policy === "unavailable") return "unverifiable";
  if (input.policy === "presence_only") {
    return input.extractedText.trim().length > 0 ? "presence_ok" : "mismatched";
  }
  // normalized_containment
  if (input.expectedTexts.length === 0) return "unverifiable";
  const matched = input.expectedTexts.some((exp) =>
    renderedTextCoversExpected(input.extractedText, exp),
  );
  return matched ? "matched" : "mismatched";
}

/**
 * True when extracted rendered text covers an expected message under
 * normalized_containment policy.
 */
export function renderedTextCoversExpected(
  extractedText: string,
  expected: string,
): boolean {
  const a = normalizeVerificationText(extractedText);
  const b = normalizeVerificationText(expected);
  if (!a || !b) return false;
  if (a.includes(b)) return true;
  const tokens = b.split(" ").filter((t) => t.length > 2);
  if (tokens.length === 0) return false;
  const hit = tokens.filter((t) => a.includes(t)).length;
  return hit / tokens.length >= 0.7;
}
