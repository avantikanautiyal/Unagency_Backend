/**
 * Compile registry deliverable composition + selected creative direction
 * into a structured CompiledCreativeComposition for CMR / provider boundary.
 *
 * Deliverable contract = WHAT structure is required.
 * Creative direction = HOW this execution should look.
 */

import type {
  DeliverableCompositionContract,
  DeliverableElementId,
} from "../../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";
import {
  describeCompletionCriterion,
  resolveDeliverableCompositionContract,
  isRenderedCommunicationElement,
  requiredExactRenderedCommunicationElements,
} from "../../../../../Unagency-frontend/packages/api/src/domain/cdf/deliverable-composition";
import type { CdfDeliverableKind } from "../../../../../Unagency-frontend/packages/api/src/domain/cdf-stage-deliverable";
import type { SelectedSemanticChoice } from "./resolve-selected-choice";
import type {
  CanonicalBrandContext,
  CanonicalProductGrounding,
} from "./types";
import { composeDeliverableSemantics } from "./compose-deliverable-semantics";
import {
  buildLowerAuthorityQualification,
  buildRequiredRenderedCommunication,
  buildSemanticRoleSeparation,
  type LowerAuthorityQualificationBlock,
  type RequiredRenderedCommunicationBlock,
  type SemanticRoleSeparationBlock,
} from "./composition-authority";

export type CompositionSlotSource =
  | "creative_direction"
  | "user_instruction"
  | "brand_context"
  | "deliverable_contract"
  /** Framework-composed phase generation prompt — never on-asset text. */
  | "phase_prompt";

/**
 * Authority of `currentUserInstruction`: the user's own words
 * (explicit / conversational / refine) vs the framework-composed phase prompt.
 */
export type CurrentInstructionAuthority = "user_instruction" | "phase_prompt";

export type CompositionSlot = {
  readonly element: DeliverableElementId | string;
  readonly value: string;
  readonly source: CompositionSlotSource;
};

export type CompiledCreativeComposition = {
  readonly deliverableKind: CdfDeliverableKind;
  readonly deliverableIdentity: {
    readonly kind: CdfDeliverableKind;
    readonly concreteLabel: string;
    readonly statement: string;
  };
  readonly communicationMode: DeliverableCompositionContract["communicationMode"];
  readonly requiredElements: readonly DeliverableElementId[];
  readonly optionalElements: readonly DeliverableElementId[];
  readonly hierarchy: readonly {
    readonly role: string;
    readonly precedence: number;
  }[];
  readonly policies: {
    readonly text: {
      readonly placement: string;
      readonly required: boolean;
    };
    readonly visual: {
      readonly subjectRequired: boolean;
      readonly layoutIntent?: string;
    };
    readonly brand: {
      readonly markRole: string;
    };
  };
  readonly filledSlots: readonly CompositionSlot[];
  readonly compositionGuidance: readonly string[];
  /**
   * Structured required on-asset communication — distinct from creative
   * direction prose, brand signature, and visual subject.
   */
  readonly requiredRenderedCommunication: RequiredRenderedCommunicationBlock;
  readonly semanticRoleSeparation: SemanticRoleSeparationBlock;
  readonly lowerAuthorityQualification: LowerAuthorityQualificationBlock | null;
  readonly structuralCompletion: readonly {
    readonly criterion: string;
    readonly structural: true;
  }[];
  readonly structuralCompletionNote: string;
  readonly userInstructionAuthoritative: true;
};

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  return t ? t : undefined;
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const v of values) {
    if (v) return v;
  }
  return undefined;
}

function slot(
  element: DeliverableElementId | string,
  value: string | undefined,
  source: CompositionSlotSource,
): CompositionSlot | undefined {
  if (!value) return undefined;
  return { element, value, source };
}

function slotsFromCreativeDirection(
  choice: Readonly<Record<string, unknown>>,
): CompositionSlot[] {
  const out: CompositionSlot[] = [];
  const push = (s: CompositionSlot | undefined) => {
    if (s) out.push(s);
  };

  push(
    slot(
      "primary_message_surface",
      firstNonEmpty(
        asNonEmptyString(choice.primaryMessage),
        asNonEmptyString(choice.headlineAngle),
        asNonEmptyString(choice.communicationObjective),
        asNonEmptyString(choice.messaging),
      ),
      "creative_direction",
    ),
  );
  push(
    slot(
      "secondary_message_surface",
      asNonEmptyString(choice.secondaryMessage),
      "creative_direction",
    ),
  );
  push(
    slot(
      "visual_subject",
      firstNonEmpty(
        asNonEmptyString(choice.visualConcept),
        asNonEmptyString(choice.focalPoint),
        asNonEmptyString(choice.creativeIdea),
        asNonEmptyString(choice.visualTreatment),
      ),
      "creative_direction",
    ),
  );
  push(
    slot(
      "message_hierarchy",
      firstNonEmpty(
        asNonEmptyString(choice.hierarchy),
        asNonEmptyString(choice.composition),
      ),
      "creative_direction",
    ),
  );
  push(
    slot(
      "layout_zones",
      asNonEmptyString(choice.composition),
      "creative_direction",
    ),
  );
  push(
    slot(
      "brand_signature",
      firstNonEmpty(
        asNonEmptyString(choice.brandIntegration),
        asNonEmptyString(choice.identityMarkRole),
      ),
      "creative_direction",
    ),
  );
  push(
    slot("identity_mark", asNonEmptyString(choice.identityMarkRole), "creative_direction"),
  );
  push(
    slot(
      "typography_treatment",
      asNonEmptyString(choice.typographyDirection),
      "creative_direction",
    ),
  );
  push(
    slot(
      "communication_objective",
      asNonEmptyString(choice.communicationObjective),
      "creative_direction",
    ),
  );
  push(
    slot(
      "supporting_visual_elements",
      asNonEmptyString(choice.supportingVisualElements),
      "creative_direction",
    ),
  );
  push(
    slot(
      "use_context",
      asNonEmptyString(choice.useContextIntent),
      "creative_direction",
    ),
  );

  return out;
}

export type CompileDeliverableCompositionInput = {
  readonly deliverableKind: CdfDeliverableKind;
  readonly contract: DeliverableCompositionContract;
  readonly selectedChoice?: SelectedSemanticChoice;
  readonly currentUserInstruction: string;
  /** Defaults to user_instruction (explicit caller-supplied instruction). */
  readonly currentUserInstructionAuthority?: CurrentInstructionAuthority;
  readonly brandContext?: CanonicalBrandContext;
  readonly productGrounding?: CanonicalProductGrounding;
  readonly deliverableLabel?: string;
  readonly phaseName?: string;
  readonly artifactKey?: string;
  readonly generationModality?: string;
};

export function compileDeliverableComposition(
  input: CompileDeliverableCompositionInput,
): CompiledCreativeComposition {
  const semantics = composeDeliverableSemantics({
    deliverableLabel: input.deliverableLabel,
    phaseName: input.phaseName,
    artifactKey: input.artifactKey,
    generationModality: input.generationModality,
    productGrounding: input.productGrounding,
  });

  const choice = input.selectedChoice?.choice ?? {};
  const filledSlots: CompositionSlot[] = [...slotsFromCreativeDirection(choice)];

  const instruction = input.currentUserInstruction.trim();
  const instructionAuthority: CurrentInstructionAuthority =
    input.currentUserInstructionAuthority ?? "user_instruction";
  if (instruction) {
    filledSlots.push({
      element: "user_intent",
      value: instruction,
      source:
        instructionAuthority === "phase_prompt" ? "phase_prompt" : "user_instruction",
    });
  }

  const brandName = input.brandContext?.brandName?.trim();
  if (brandName) {
    filledSlots.push({
      element: "brand_context_name",
      value: brandName,
      source: "brand_context",
    });
  }

  const contract = input.contract;

  // Provenance-aware resolution for required exact-message elements.
  // Prefer selected semantic direction slots; if absent, current user instruction
  // may supply the exact value (unchanged). Brand marks never fill these roles.
  // model_authored elements declare no exact value — never filled from prompts.
  // A framework-composed phase prompt is never on-asset text: without a
  // direction or user-authored value the surface stays unresolved (fail closed).
  if (
    contract.textPolicy?.placement === "on_asset" &&
    contract.textPolicy?.required === true &&
    instruction &&
    instructionAuthority === "user_instruction"
  ) {
    for (const element of requiredExactRenderedCommunicationElements(contract)) {
      const already = filledSlots.some(
        (s) =>
          s.element === element &&
          isRenderedCommunicationElement(s.element) &&
          s.value.trim().length > 0,
      );
      if (already) continue;
      filledSlots.push({
        element,
        value: instruction,
        source: "user_instruction",
      });
    }
  }

  const structuralCompletion = contract.completionCriteria.map((c) => ({
    criterion: describeCompletionCriterion(c),
    structural: true as const,
  }));

  const requiredRenderedCommunication = buildRequiredRenderedCommunication({
    contract,
    filledSlots,
  });
  const semanticRoleSeparation = buildSemanticRoleSeparation();
  const lowerAuthorityQualification =
    buildLowerAuthorityQualification(contract);

  const guidance = [...(contract.compositionGuidance ?? [])];
  if (requiredRenderedCommunication.active) {
    guidance.push(semanticRoleSeparation.note);
    if (lowerAuthorityQualification) {
      guidance.push(lowerAuthorityQualification.note);
    }
  }

  return {
    deliverableKind: input.deliverableKind,
    deliverableIdentity: {
      kind: input.deliverableKind,
      concreteLabel: semantics.concreteLabel,
      statement: semantics.statement,
    },
    communicationMode: contract.communicationMode,
    requiredElements: [...contract.requiredElements],
    optionalElements: [...(contract.optionalElements ?? [])],
    hierarchy: [...(contract.hierarchy ?? [])],
    policies: {
      text: {
        placement: contract.textPolicy?.placement ?? "none",
        required: contract.textPolicy?.required ?? false,
      },
      visual: {
        subjectRequired: contract.visualPolicy?.subjectRequired ?? false,
        ...(contract.visualPolicy?.layoutIntent
          ? { layoutIntent: contract.visualPolicy.layoutIntent }
          : {}),
      },
      brand: {
        markRole: contract.brandIntegration?.markRole ?? "none",
      },
    },
    filledSlots,
    compositionGuidance: guidance,
    requiredRenderedCommunication,
    semanticRoleSeparation,
    lowerAuthorityQualification,
    structuralCompletion,
    structuralCompletionNote:
      "Structural completion criteria describe required semantic elements and hierarchy — not aesthetic quality or model judgment.",
    userInstructionAuthoritative: true,
  };
}

export function resolveAndCompileDeliverableComposition(input: {
  readonly deliverableKind: CdfDeliverableKind;
  readonly selectedChoice?: SelectedSemanticChoice;
  readonly currentUserInstruction: string;
  readonly currentUserInstructionAuthority?: CurrentInstructionAuthority;
  readonly brandContext?: CanonicalBrandContext;
  readonly productGrounding?: CanonicalProductGrounding;
  readonly deliverableLabel?: string;
  readonly phaseName?: string;
  readonly artifactKey?: string;
  readonly generationModality?: string;
}):
  | { readonly ok: true; readonly compiled: CompiledCreativeComposition }
  | {
      readonly ok: false;
      readonly code: "CDF_DELIVERABLE_COMPOSITION_MISSING";
      readonly message: string;
      readonly details: Record<string, unknown>;
    } {
  const contract = resolveDeliverableCompositionContract(input.deliverableKind);
  if (!contract) {
    return {
      ok: false,
      code: "CDF_DELIVERABLE_COMPOSITION_MISSING",
      message: `No deliverable composition contract for kind "${input.deliverableKind}"`,
      details: { deliverableKind: input.deliverableKind },
    };
  }
  return {
    ok: true,
    compiled: compileDeliverableComposition({
      ...input,
      contract,
    }),
  };
}
