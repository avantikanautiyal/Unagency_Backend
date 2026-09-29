/**
 * Compile ResolvedGenerationContext + rehydrated upstream → CanonicalGenerationRequest.
 */

import type { ConversationWorkingMemory } from "../../ai/conversation-working-memory";
import type { MultimodalContext } from "../../ai/multimodal-context";
import type { GenerationReferenceResolutionResult } from "../../ai/reference-resolution";
import type { ResolvedGenerationContext } from "../context-resolver/types";
import { computeGenerationContextHash } from "./hash";
import type { SelectedSemanticChoice } from "./resolve-selected-choice";
import type {
  CanonicalBrandContext,
  CanonicalGenerationConstraint,
  CanonicalGenerationRequest,
  CanonicalProductGrounding,
  UpstreamArtifactContext,
} from "./types";

export function compileCanonicalGenerationRequest(input: {
  resolved: ResolvedGenerationContext;
  upstream: UpstreamArtifactContext[];
  currentUserInstruction: string;
  canonicalFullDeck: boolean;
  referenceResolution?: GenerationReferenceResolutionResult;
  workingMemory?: ConversationWorkingMemory;
  multimodalContext?: MultimodalContext;
  selectedSemanticChoices?: readonly SelectedSemanticChoice[];
  userSelectedGenerationReference?: CanonicalGenerationRequest["userSelectedGenerationReference"];
  brandContext?: CanonicalBrandContext;
  productGrounding?: CanonicalProductGrounding;
  conversationalInterpretation?: {
    text: string;
    role: "advisory_cti_interpretation";
  };
}): CanonicalGenerationRequest {
  const { resolved, upstream, currentUserInstruction, canonicalFullDeck } =
    input;

  const constraints: CanonicalGenerationConstraint[] = [
    ...resolved.constraints.map((c) => ({
      key: c.key,
      displayValue: c.displayValue,
      priority: String(c.priority),
      source: "requirement" as const,
    })),
    ...resolved.exclusions.map((e) => ({
      key: e.key,
      displayValue: e.displayValue,
      priority: String(e.priority),
      source: "exclusion" as const,
    })),
  ];

  // Priority order preserved from Requirement Engine (already ranked in activeRequirements).
  const requirements = [...resolved.activeRequirements].sort((a, b) => {
    const rank = (p: string) => {
      const order = [
        "explicit_current_user_instruction",
        "explicit_user_override",
        "approved_user_decision",
        "earlier_explicit_user_requirement",
        "user_provided_source_reference",
        "cdf_service_rule",
        "system_default",
        "ai_inference",
      ];
      const i = order.indexOf(p);
      return i < 0 ? 99 : i;
    };
    return rank(String(a.priority)) - rank(String(b.priority));
  });

  const phasePurpose =
    resolved.phaseContext.entryMessage?.trim() ||
    resolved.phaseContext.description?.trim() ||
    resolved.phaseContext.name;
  const outputInstructions = [
    `Generate ONLY the deliverable for CDF phase "${resolved.phaseId}" (${resolved.phaseContext.name}).`,
    `Phase purpose: ${phasePurpose}`,
    `Semantic role (uxType): ${resolved.phaseContext.uxType}`,
    `Execution strategy: ${resolved.phaseContext.executionStrategy}`,
    "Modality describes encoding — it does NOT redefine the phase task as generic visual composition.",
    "Treat UPSTREAM ARTIFACT sections as authoritative structured sources.",
    "Do not ignore or regenerate approved upstream content from scratch.",
    "Do not invent facts that contradict REQUIREMENTS or UPSTREAM ARTIFACT data.",
  ];
  if (resolved.phaseContext.choiceNoun) {
    outputInstructions.push(
      `Choice noun for options: ${resolved.phaseContext.choiceNoun}`,
    );
  }
  if (resolved.phaseContext.textLines?.length) {
    outputInstructions.push(
      `Scaffold each option with: ${resolved.phaseContext.textLines.join("; ")}`,
    );
  }
  if (canonicalFullDeck) {
    outputInstructions.push(
      "Compile the full deck from approved slide-content and design-system — do not invent a new storyline via route concepts.",
    );
  }

  const generationContextHash = computeGenerationContextHash({
    currentUserInstruction,
    resolved,
    upstream,
    canonicalFullDeck,
  });

  return {
    currentUserInstruction,
    requirements,
    constraints,
    exclusions: resolved.exclusions,
    selections: resolved.selections,
    ...(input.selectedSemanticChoices?.length
      ? { selectedSemanticChoices: [...input.selectedSemanticChoices] }
      : {}),
    ...(input.userSelectedGenerationReference
      ? {
          userSelectedGenerationReference:
            input.userSelectedGenerationReference,
        }
      : {}),
    ...(input.brandContext ? { brandContext: input.brandContext } : {}),
    ...(input.productGrounding
      ? { productGrounding: input.productGrounding }
      : {}),
    approvedDecisions: resolved.approvedDecisions,
    cdfContext: {
      contextId: resolved.contextId,
      contextHash: resolved.contextHash,
      sessionId: resolved.sessionId,
      serviceId: resolved.serviceId,
      phaseId: resolved.phaseId,
      sessionVersion: resolved.sessionVersion,
      activeBriefId: resolved.activeBriefId,
      activeBriefVersion: resolved.activeBriefVersion,
      contextSource: resolved.contextSource,
      status: resolved.status,
      phaseContext: resolved.phaseContext,
    },
    upstreamArtifacts: upstream,
    outputContract: {
      serviceId: resolved.serviceId,
      phaseId: resolved.phaseId,
      generationModality: resolved.phaseContext.generationModality,
      artifactKey: resolved.phaseContext.artifactKey,
      canonicalFullDeck,
      instructions: outputInstructions,
      executionStrategy: resolved.phaseContext.executionStrategy,
    },
    ...(input.referenceResolution
      ? { referenceResolution: input.referenceResolution }
      : {}),
    ...(input.workingMemory?.applied
      ? { workingMemory: input.workingMemory }
      : {}),
    ...(input.conversationalInterpretation
      ? { conversationalInterpretation: input.conversationalInterpretation }
      : {}),
    ...(input.multimodalContext?.applied
      ? { multimodalContext: input.multimodalContext }
      : {}),
    generationContextHash,
    resolvedContext: resolved,
  };
}
