/**
 * AI Core — Generation reference resolution (Phase 6).
 * Single authority for deterministic conversational → explicit targets
 * on the canonical generation path. Does not implement ConversationWorkingMemory.
 */

export type {
  GenerationReferenceResolutionStatus,
  GenerationReferenceType,
  GenerationReferenceTargetType,
  GenerationResolutionMethod,
  GenerationReferenceCandidate,
  ResolvedGenerationReference,
  GenerationReferenceResolutionResult,
  ResolveGenerationReferencesInput,
} from "./types";

export {
  parseExplicitSlideNumber,
  parseOrdinalSlide,
  parseOptionReference,
  parseExplicitVersionNumber,
  detectReferenceSpans,
  isStorylineKey,
  isSlideContentKey,
  isSelectableChoiceArtifactKey,
} from "./parse";

export {
  buildGenerationReferenceCandidates,
  selectedSlideNumberFromMetadata,
  ctiHintFromMetadata,
  type ReferenceSessionPins,
  type ReferenceUpstreamPin,
} from "./candidates";

export {
  resolveGenerationReferences,
  summarizeGenerationReferencesForTrace,
} from "./resolve";
