/**
 * Compose an actionable semantic objective for the current generation task.
 *
 * Must NOT use UI entryMessage / phase marketing copy as the creative objective.
 * Derives from authoritative generation inputs only — no serviceId/phaseId branches.
 */

import type { CanonicalGenerationRequest } from "./types";
import type { SelectedSemanticChoice } from "./resolve-selected-choice";
import { composeDeliverableSemantics } from "./compose-deliverable-semantics";

function firstNonEmpty(...values: Array<string | undefined | null>): string | undefined {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function summarizeInstruction(instruction: string, max = 280): string {
  const t = instruction.replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function summarizeChoice(choice: SelectedSemanticChoice): string | undefined {
  const c = choice.choice;
  const name = firstNonEmpty(
    typeof c.name === "string" ? c.name : undefined,
    typeof c.routeId === "string" ? c.routeId : undefined,
  );
  const idea = firstNonEmpty(
    typeof c.creativeIdea === "string" ? c.creativeIdea : undefined,
    typeof c.shelfIdea === "string" ? c.shelfIdea : undefined,
    typeof c.visualTreatment === "string" ? c.visualTreatment : undefined,
    typeof c.visualDirection === "string" ? c.visualDirection : undefined,
  );
  if (!name && !idea) return undefined;
  if (name && idea) {
    const short = idea.length > 160 ? `${idea.slice(0, 159)}…` : idea;
    return `${name}: ${short}`;
  }
  return name || idea;
}

export type ComposeSemanticObjectiveOptions = {
  readonly deliverableCompositionPresent?: boolean;
  readonly requiredOnAssetCommunication?: boolean;
};

/**
 * Build the CURRENT TASK SemanticObjective string.
 * Order of authority: deliverable → user instruction → selected direction → brand.
 * When deliverable composition is present, required structure outranks creative preferences.
 */
export function composeGenerationSemanticObjective(
  generation: CanonicalGenerationRequest,
  options?: ComposeSemanticObjectiveOptions,
): string {
  const parts: string[] = [];

  const deliverable = composeDeliverableSemantics({
    deliverableLabel: generation.cdfContext.phaseContext.outputLabel,
    phaseName: generation.cdfContext.phaseContext.name,
    artifactKey: generation.outputContract.artifactKey,
    generationModality: generation.outputContract.generationModality,
    productGrounding: generation.productGrounding,
  });
  parts.push(deliverable.statement);

  const brand = generation.brandContext?.brandName?.trim();
  const instruction = summarizeInstruction(generation.currentUserInstruction);
  const direction = generation.selectedSemanticChoices?.[0]
    ? summarizeChoice(generation.selectedSemanticChoices[0]!)
    : undefined;

  if (brand) {
    parts.push(`Client brand identity: ${brand}.`);
  }
  if (instruction) {
    parts.push(`Current user intent: ${instruction}`);
  }
  if (direction) {
    parts.push(`Selected creative direction: ${direction}`);
  }
  if (generation.userSelectedGenerationReference) {
    const ref = generation.userSelectedGenerationReference;
    parts.push(
      `Selected upstream visual SOURCE ASSET (${ref.visualArtifactId}${
        ref.generationFanoutTargetId
          ? ` / ${ref.generationFanoutTargetId}`
          : ""
      }): adapt/systematize/apply that exact visual — do not invent a replacement.`,
    );
  }

  if (options?.deliverableCompositionPresent) {
    if (options.requiredOnAssetCommunication) {
      parts.push(
        "Follow DELIVERABLE COMPOSITION required on-asset communication + CURRENT USER INSTRUCTION; SELECTED SEMANTIC DIRECTION realizes creative HOW; Production Spec supplies technical constraints only.",
      );
    } else {
      parts.push(
        "Follow DELIVERABLE COMPOSITION required structure + SELECTED SEMANTIC DIRECTION + BRAND CONTEXT + CURRENT USER INSTRUCTION; Production Spec supplies technical constraints only.",
      );
    }
  } else {
    parts.push(
      "Follow SELECTED SEMANTIC DIRECTION + BRAND CONTEXT + CURRENT USER INSTRUCTION; Production Spec supplies technical constraints only.",
    );
  }

  const composed = parts.join(" ").replace(/\s+/g, " ").trim();
  if (composed) return composed;

  return (
    firstNonEmpty(
      generation.cdfContext.phaseContext.name,
      generation.outputContract.artifactKey,
    ) || "Generate the requested deliverable"
  );
}
