/**
 * Composition authority helpers — required on-asset communication must carry
 * an actual authoritative value (with provenance) before provider invocation.
 *
 * Registry DeliverableCompositionContract + DELIVERABLE_ELEMENT_SEMANTIC_ROLES
 * remain the declarative source of truth. No service/provider branches.
 */

import type { DeliverableCompositionContract } from "../../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";
import type { DeliverableElementId } from "../../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";
import {
  isBrandMarkElement,
  isRenderedCommunicationElement,
  requiredExactRenderedCommunicationElements,
  requiredRenderedCommunicationElements,
} from "../../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";
import type { CompiledCreativeComposition } from "./compile-deliverable-composition";
import type { CanonicalModelRequest } from "../../ai/canonical-model-request";
import type { CanonicalProductionSpecEnrichment } from "./resolve-assembly-enrichments";

/** Typed provenance for a resolved required-communication value. */
export type CompositionValueProvenance =
  | "current_user_instruction"
  | "selected_semantic_direction"
  | "brand_context"
  | "deliverable_contract";

export function provenanceFromSlotSource(
  source: string,
): CompositionValueProvenance {
  switch (source) {
    case "user_instruction":
      return "current_user_instruction";
    case "creative_direction":
      return "selected_semantic_direction";
    case "brand_context":
      return "brand_context";
    case "deliverable_contract":
      return "deliverable_contract";
    default:
      return "deliverable_contract";
  }
}

export function contractRequiresOnAssetCommunication(
  contract: DeliverableCompositionContract | null | undefined,
): boolean {
  return (
    contract?.textPolicy?.placement === "on_asset" &&
    contract?.textPolicy?.required === true
  );
}

export function compiledRequiresOnAssetCommunication(
  compiled: CompiledCreativeComposition | null | undefined,
): boolean {
  return (
    compiled?.policies.text.placement === "on_asset" &&
    compiled?.policies.text.required === true
  );
}

export type RequiredRenderedCommunicationSurfaceResolved = {
  readonly element: DeliverableElementId | string;
  readonly resolutionStatus: "resolved";
  readonly text: string;
  readonly provenance: CompositionValueProvenance;
  readonly required: true;
  readonly semanticClass: "required_rendered_communication";
};

export type RequiredRenderedCommunicationSurfaceUnresolved = {
  readonly element: DeliverableElementId | string;
  readonly resolutionStatus: "unresolved";
  readonly required: true;
  readonly semanticClass: "required_rendered_communication";
};

export type RequiredRenderedCommunicationSurface =
  | RequiredRenderedCommunicationSurfaceResolved
  | RequiredRenderedCommunicationSurfaceUnresolved;

export type RequiredRenderedCommunicationBlock = {
  readonly active: boolean;
  readonly placement: string;
  readonly required: boolean;
  readonly surfaces: readonly RequiredRenderedCommunicationSurface[];
  readonly allRequiredResolved: boolean;
  readonly unresolvedElements: readonly string[];
  /** Required on-asset text whose content the model composes (no exact value). */
  readonly modelAuthoredElements: readonly string[];
  readonly note: string;
};

export type SemanticRoleSeparationBlock = {
  readonly note: string;
  readonly brandSignatureDoesNotSatisfyPrimaryMessage: true;
  readonly identityMarkDoesNotSatisfyPrimaryMessage: true;
  readonly visualSubjectDoesNotSatisfyPrimaryMessage: true;
};

export type LowerAuthorityQualificationBlock = {
  readonly requiredOnAssetText: true;
  readonly note: string;
};

function isNonEmptyAuthoritativeText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Build required rendered communication from resolved composition slots.
 * Never invents placeholder text for unresolved surfaces.
 */
export function buildRequiredRenderedCommunication(input: {
  readonly contract: DeliverableCompositionContract;
  readonly filledSlots: readonly {
    readonly element: string;
    readonly value: string;
    readonly source: string;
  }[];
}): RequiredRenderedCommunicationBlock {
  const active = contractRequiresOnAssetCommunication(input.contract);
  const requiredRoles = active
    ? requiredExactRenderedCommunicationElements(input.contract)
    : [];
  const modelAuthoredElements = active
    ? requiredRenderedCommunicationElements(input.contract).filter(
        (el) => !requiredRoles.includes(el),
      )
    : [];

  const surfaces: RequiredRenderedCommunicationSurface[] = [];
  const unresolvedElements: string[] = [];

  for (const role of requiredRoles) {
    const slot = input.filledSlots.find(
      (s) =>
        s.element === role &&
        isRenderedCommunicationElement(s.element) &&
        !isBrandMarkElement(s.element) &&
        isNonEmptyAuthoritativeText(s.value) &&
        (s.source === "creative_direction" || s.source === "user_instruction"),
    );
    if (slot) {
      surfaces.push({
        element: role,
        resolutionStatus: "resolved",
        text: slot.value, // exact — no paraphrase
        provenance: provenanceFromSlotSource(slot.source),
        required: true,
        semanticClass: "required_rendered_communication",
      });
    } else {
      surfaces.push({
        element: role,
        resolutionStatus: "unresolved",
        required: true,
        semanticClass: "required_rendered_communication",
      });
      unresolvedElements.push(role);
    }
  }

  return {
    active,
    placement: input.contract.textPolicy?.placement ?? "none",
    required: input.contract.textPolicy?.required ?? false,
    surfaces,
    allRequiredResolved: unresolvedElements.length === 0,
    unresolvedElements,
    modelAuthoredElements,
    note: !active
      ? "On-asset rendered communication is not required by this deliverable composition contract."
      : requiredRoles.length > 0
        ? "REQUIRED_RENDERED_COMMUNICATION must appear as legible on-asset text with an authoritative non-empty value. Distinct from CREATIVE_DIRECTION, VISUAL_SUBJECT, BRAND_SIGNATURE, and decorative typography."
        : "On-asset text is required, composed from deliverable guidance (no exact message declared). Distinct from CREATIVE_DIRECTION, VISUAL_SUBJECT, BRAND_SIGNATURE.",
  };
}

export function buildSemanticRoleSeparation(): SemanticRoleSeparationBlock {
  return {
    brandSignatureDoesNotSatisfyPrimaryMessage: true,
    identityMarkDoesNotSatisfyPrimaryMessage: true,
    visualSubjectDoesNotSatisfyPrimaryMessage: true,
    note:
      "Semantic roles are not interchangeable: brand_signature and identity_mark do not satisfy primary_message_surface; visual_subject does not satisfy required rendered communication. Only elements with declarative role rendered_communication count as required on-asset communication.",
  };
}

export function buildLowerAuthorityQualification(
  contract: DeliverableCompositionContract,
): LowerAuthorityQualificationBlock | null {
  if (!contractRequiresOnAssetCommunication(contract)) return null;
  return {
    requiredOnAssetText: true,
    note:
      "When textPolicy requires on-asset communication, lower-authority preferences that minimize decorative or non-essential text still apply only to non-required text. Required rendered communication surfaces must remain on the asset. Selected creative direction defines HOW to realize the frame; it does not cancel WHAT the deliverable composition requires.",
  };
}

export function selectedDirectionAuthorityText(input: {
  readonly compositionPresent: boolean;
  readonly requiredOnAsset: boolean;
}): string {
  if (input.compositionPresent && input.requiredOnAsset) {
    return [
      "SELECTED SEMANTIC DIRECTION is authoritative for creative realization (HOW).",
      "Generate from the structured choice object — not from UI labels, Option N, or selection indexes alone.",
      "It does not override DELIVERABLE COMPOSITION required elements, hierarchy, or required on-asset textPolicy.",
    ].join(" ");
  }
  if (input.compositionPresent) {
    return [
      "SELECTED SEMANTIC DIRECTION is authoritative for creative realization (HOW).",
      "Generate from the structured choice object — not from UI labels, Option N, or selection indexes alone.",
      "DELIVERABLE COMPOSITION defines required structural elements and outranks creative-direction preferences when they conflict on structure.",
    ].join(" ");
  }
  return [
    "SELECTED SEMANTIC DIRECTION is authoritative.",
    "Generate from the structured choice object — not from UI labels, Option N, or selection indexes alone.",
  ].join(" ");
}

export function compositionAuthorityText(
  qualification: LowerAuthorityQualificationBlock | null | undefined,
  separation: SemanticRoleSeparationBlock | null | undefined,
): string | null {
  if (!qualification?.requiredOnAssetText) return null;
  return [
    "COMPOSITION AUTHORITY:",
    qualification.note,
    separation?.note ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function qualifyProductionSpecForRequiredComposition(
  spec: CanonicalProductionSpecEnrichment | undefined,
  compiled: CompiledCreativeComposition | undefined,
): CanonicalProductionSpecEnrichment | undefined {
  if (!spec || !compiledRequiresOnAssetCommunication(compiled)) return spec;
  const note =
    compiled!.lowerAuthorityQualification?.note ??
    "Required on-asset communication outranks decorative-text minimization preferences in production guidance.";
  const already = spec.sections.some(
    (s) => s.id === "composition_authority_qualification",
  );
  if (already) return spec;
  return {
    ...spec,
    text: `${spec.text.trim()}\n\n[Composition authority]\n${note}`,
    sections: [
      ...spec.sections,
      {
        id: "composition_authority_qualification",
        title: "Composition authority (outranks decorative-text preferences)",
        lines: Object.freeze([note]) as readonly string[],
      },
    ],
  };
}

export type CmrCompositionInvariantResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: "CDF_DELIVERABLE_COMPOSITION_CMR_INVARIANT";
      readonly message: string;
      readonly details: Record<string, unknown>;
    };

function isAuthoritativeCommunicationProvenance(
  provenance: unknown,
): provenance is CompositionValueProvenance {
  return (
    provenance === "current_user_instruction" ||
    provenance === "selected_semantic_direction"
  );
}

function surfaceHasAuthoritativeValue(
  surface: Record<string, unknown>,
): boolean {
  if (surface.resolutionStatus === "unresolved") return false;
  if (surface.resolutionStatus !== "resolved") return false;
  if (!isNonEmptyAuthoritativeText(surface.text)) return false;
  if (!isAuthoritativeCommunicationProvenance(surface.provenance)) {
    return false;
  }
  if (surface.semanticClass !== "required_rendered_communication") return false;
  if (surface.required !== true) return false;
  return true;
}

/**
 * Fail-closed check on compiled RRC before / at CMR boundary.
 */
export function assertRequiredCommunicationValuesResolved(input: {
  readonly contract: DeliverableCompositionContract | null | undefined;
  readonly compiled: CompiledCreativeComposition | null | undefined;
}): CmrCompositionInvariantResult {
  if (!contractRequiresOnAssetCommunication(input.contract)) {
    return { ok: true };
  }
  if (!input.compiled) {
    return {
      ok: false,
      code: "CDF_DELIVERABLE_COMPOSITION_CMR_INVARIANT",
      message:
        "Required on-asset deliverable composition was not compiled into generation enrichments",
      details: {
        textPolicy: input.contract?.textPolicy ?? null,
        deliverableKind: input.contract?.kind ?? null,
      },
    };
  }
  const rrc = input.compiled.requiredRenderedCommunication;
  if (!rrc.active || !rrc.allRequiredResolved) {
    return {
      ok: false,
      code: "CDF_DELIVERABLE_COMPOSITION_CMR_INVARIANT",
      message:
        "Required on-asset communication surfaces could not be resolved to authoritative non-empty values",
      details: {
        unresolvedElements: rrc.unresolvedElements,
        deliverableKind: input.contract?.kind ?? null,
        textPolicy: input.contract?.textPolicy ?? null,
        surfaces: rrc.surfaces.map((s) => ({
          element: s.element,
          resolutionStatus: s.resolutionStatus,
          required: s.required,
          semanticClass: s.semanticClass,
          ...(s.resolutionStatus === "resolved"
            ? {
                textLength: s.text.trim().length,
                provenance: s.provenance,
              }
            : {
                textLength: 0,
                reason:
                  "No filled slot with authoritative creative_direction or user_instruction provenance and non-empty text",
              }),
        })),
        filledSlotCandidates: input.compiled.filledSlots
          .filter((s) =>
            rrc.unresolvedElements.includes(String(s.element)),
          )
          .map((s) => ({
            element: s.element,
            source: s.source,
            valueLength: s.value.trim().length,
            rejectedBecause:
              s.source !== "creative_direction" && s.source !== "user_instruction"
                ? `source "${s.source}" is not authoritative for required rendered communication`
                : s.value.trim().length === 0
                  ? "empty value"
                  : null,
          })),
      },
    };
  }
  for (const surface of rrc.surfaces) {
    if (surface.resolutionStatus !== "resolved") {
      return {
        ok: false,
        code: "CDF_DELIVERABLE_COMPOSITION_CMR_INVARIANT",
        message: `Required communication surface "${surface.element}" is unresolved`,
        details: { element: surface.element },
      };
    }
    if (
      !isNonEmptyAuthoritativeText(surface.text) ||
      !isAuthoritativeCommunicationProvenance(surface.provenance)
    ) {
      return {
        ok: false,
        code: "CDF_DELIVERABLE_COMPOSITION_CMR_INVARIANT",
        message: `Required communication surface "${surface.element}" lacks authoritative value or provenance`,
        details: {
          element: surface.element,
          provenance: surface.provenance,
        },
      };
    }
  }
  return { ok: true };
}

/**
 * CMR boundary invariant: required on-asset composition ⇒
 * structured deliverable_composition with resolved authoritative RRC values.
 */
export function assertRequiredOnAssetCompositionInCmr(input: {
  readonly compositionRequired: boolean;
  readonly contract: DeliverableCompositionContract | null | undefined;
  readonly compiled: CompiledCreativeComposition | null | undefined;
  readonly modelRequest: CanonicalModelRequest;
}): CmrCompositionInvariantResult {
  if (
    !input.compositionRequired ||
    !contractRequiresOnAssetCommunication(input.contract)
  ) {
    return { ok: true };
  }

  const compiledCheck = assertRequiredCommunicationValuesResolved({
    contract: input.contract,
    compiled: input.compiled,
  });
  if (!compiledCheck.ok) return compiledCheck;

  const expectedElements = requiredExactRenderedCommunicationElements(
    input.contract!,
  );

  let found = false;
  let textRequired = false;
  let textOnAsset = false;
  let hasRequiredRendered = false;
  let surfaces: Array<Record<string, unknown>> = [];

  for (const m of input.modelRequest.messages) {
    for (const p of m.content) {
      if (p.type !== "structured" || p.name !== "deliverable_composition") {
        continue;
      }
      found = true;
      const data = p.data as Record<string, unknown>;
      const policies = data.policies as Record<string, unknown> | undefined;
      const text = policies?.text as Record<string, unknown> | undefined;
      textRequired = text?.required === true;
      textOnAsset = text?.placement === "on_asset";
      const rrc = data.requiredRenderedCommunication as
        | Record<string, unknown>
        | undefined;
      hasRequiredRendered = rrc?.active === true;
      surfaces = Array.isArray(rrc?.surfaces)
        ? (rrc!.surfaces as Array<Record<string, unknown>>)
        : [];
    }
  }

  if (!found) {
    return {
      ok: false,
      code: "CDF_DELIVERABLE_COMPOSITION_CMR_INVARIANT",
      message:
        "CMR lacks structured deliverable_composition while contract requires on-asset communication",
      details: {
        textPolicy: input.contract?.textPolicy ?? null,
        deliverableKind: input.contract?.kind ?? null,
      },
    };
  }

  if (!textRequired || !textOnAsset || !hasRequiredRendered) {
    return {
      ok: false,
      code: "CDF_DELIVERABLE_COMPOSITION_CMR_INVARIANT",
      message:
        "CMR deliverable_composition present but required on-asset rendered communication block is missing or inactive",
      details: {
        textRequired,
        textOnAsset,
        hasRequiredRendered,
        deliverableKind: input.contract?.kind ?? null,
      },
    };
  }

  if (surfaces.length === 0 && expectedElements.length > 0) {
    return {
      ok: false,
      code: "CDF_DELIVERABLE_COMPOSITION_CMR_INVARIANT",
      message:
        "CMR requiredRenderedCommunication has no surfaces while on-asset text is required",
      details: { expectedElements },
    };
  }

  for (const expected of expectedElements) {
    const surface = surfaces.find((s) => s.element === expected);
    if (!surface || !surfaceHasAuthoritativeValue(surface)) {
      return {
        ok: false,
        code: "CDF_DELIVERABLE_COMPOSITION_CMR_INVARIANT",
        message: `CMR required communication surface "${expected}" lacks authoritative non-empty value with provenance`,
        details: {
          element: expected,
          resolutionStatus: surface?.resolutionStatus ?? null,
          hasText: isNonEmptyAuthoritativeText(surface?.text),
          provenance: surface?.provenance ?? null,
        },
      };
    }
  }

  return { ok: true };
}
