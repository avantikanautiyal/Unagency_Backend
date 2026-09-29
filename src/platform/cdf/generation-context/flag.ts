/**
 * CDF_CANONICAL_GENERATION_CONTEXT — Phase 2 strangler flag.
 * Default OFF: legacy approval-note prompt path.
 * ON (1|true): backend resolves context + exact ArtifactVersions into generation.
 */

export const CDF_CANONICAL_GENERATION_CONTEXT_ENV =
  "CDF_CANONICAL_GENERATION_CONTEXT" as const;

export function isCdfCanonicalGenerationContextEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const v = env[CDF_CANONICAL_GENERATION_CONTEXT_ENV];
  return v === "1" || v === "true";
}

/** Metadata markers stamped when canonical context was applied. */
export const CDF_CANONICAL_CONTEXT_META = {
  enabled: "cdfCanonicalGenerationContext",
  applied: "cdfCanonicalContextApplied",
  hash: "cdfCanonicalContextHash",
  contextId: "cdfCanonicalContextId",
  fullDeck: "cdfCanonicalFullDeck",
  upstreamCount: "cdfCanonicalUpstreamCount",
  fallbackUsed: "cdfCanonicalFallbackUsed",
  resolutionOk: "cdfCanonicalResolutionOk",
  sectionsPresent: "cdfCanonicalSectionsPresent",
  promptLength: "cdfCanonicalPromptLength",
  modelRequestApplied: "cdfCanonicalModelRequestApplied",
  messageCount: "cdfCanonicalMessageCount",
  contentPartCount: "cdfCanonicalContentPartCount",
  structuredPartCount: "cdfCanonicalStructuredPartCount",
  /** Phase 5 — CMR already contains Production Spec + output requirements. */
  assemblyComplete: "cdfCanonicalAssemblyComplete",
  skipPostCmrAppends: "cdfSkipPostCmrPromptAppends",
  productionSpecPresent: "cdfCanonicalProductionSpecPresent",
  outputRequirementsPresent: "cdfCanonicalOutputRequirementsPresent",
  /** Phase 6 — reference resolution observability. */
  referenceResolutionApplied: "cdfReferenceResolutionApplied",
  resolvedReferenceCount: "cdfResolvedReferenceCount",
  unresolvedReferenceCount: "cdfUnresolvedReferenceCount",
  ambiguousReferenceCount: "cdfAmbiguousReferenceCount",
  /** Phase 7 — working memory observability (counts/IDs only). */
  workingMemoryApplied: "cdfWorkingMemoryApplied",
  workingMemoryItemCount: "cdfWorkingMemoryItemCount",
  workingMemoryCharacterCount: "cdfWorkingMemoryCharacterCount",
  workingMemoryTurnCount: "cdfWorkingMemoryTurnCount",
  workingMemorySelectionMethod: "cdfWorkingMemorySelectionMethod",
  workingMemoryTruncated: "cdfWorkingMemoryTruncated",
  workingMemoryDroppedItemCount: "cdfWorkingMemoryDroppedItemCount",
  workingMemorySourceConversationId: "cdfWorkingMemorySourceConversationId",
  /** Phase 7A — live conversation handoff. */
  conversationIdPresent: "cdfConversationIdPresent",
  channelIdPresent: "cdfChannelIdPresent",
  conversationContextAvailable: "cdfConversationContextAvailable",
  conversationMessageCountLoaded: "cdfConversationMessageCountLoaded",
  /** Phase 8 — artifact context rehydration (IDs/hashes/counts only). */
  artifactContextApplied: "cdfArtifactContextApplied",
  requiredArtifactCount: "cdfRequiredArtifactCount",
  optionalArtifactCount: "cdfOptionalArtifactCount",
  loadedArtifactCount: "cdfLoadedArtifactCount",
  missingArtifactCount: "cdfMissingArtifactCount",
  skippedOptionalArtifactCount: "cdfSkippedOptionalArtifactCount",
  artifactContextHash: "cdfArtifactContextHash",
  loadedArtifactsFromReferences: "cdfLoadedArtifactsFromReferences",
  /** Phase 9 — multimodal context (counts/ids only; no URLs/bytes). */
  multimodalContextApplied: "cdfMultimodalContextApplied",
  multimodalItemCount: "cdfMultimodalItemCount",
  multimodalImageCount: "cdfMultimodalImageCount",
  multimodalDocumentCount: "cdfMultimodalDocumentCount",
  multimodalUnsupportedCount: "cdfMultimodalUnsupportedCount",
  multimodalExtractedTextCount: "cdfMultimodalExtractedTextCount",
  multimodalProviderMappedCount: "cdfMultimodalProviderMappedCount",
  multimodalProviderOmittedCount: "cdfMultimodalProviderOmittedCount",
  multimodalSelectionMethod: "cdfMultimodalSelectionMethod",
  /** Phase 9A — provider handoff from CMR multimodal_context. */
  canonicalMultimodalProviderMappingApplied:
    "cdfCanonicalMultimodalProviderMappingApplied",
  canonicalMultimodalMappingSource: "cdfCanonicalMultimodalMappingSource",
  canonicalMultimodalMappedCount: "cdfCanonicalMultimodalMappedCount",
  canonicalMultimodalOmittedCount: "cdfCanonicalMultimodalOmittedCount",
  canonicalMultimodalItemCount: "cdfCanonicalMultimodalItemCount",
  /** Phase 10 — Context Orchestrator boundary. */
  contextOrchestratorApplied: "cdfContextOrchestratorApplied",
  canonicalAssemblySource: "cdfCanonicalAssemblySource",
  /** Semantic selection → generation intent diagnostics (presence/hashes only). */
  selectedDirectionPresent: "cdfSelectedDirectionPresent",
  selectedDirectionIdentity: "cdfSelectedDirectionIdentity",
  /** Exact selected ArtifactVersion pin (same authority as identity / CMR directions). */
  selectedArtifactId: "cdfSelectedArtifactId",
  selectedArtifactVersion: "cdfSelectedArtifactVersion",
  selectedArtifactKey: "cdfSelectedArtifactKey",
  selectedDirectionSemanticFields: "cdfSelectedDirectionSemanticFields",
  brandContextPresent: "cdfBrandContextPresent",
  brandFactKeys: "cdfBrandFactKeys",
  brandFactProvenance: "cdfBrandFactProvenance",
  selectedBrandId: "cdfSelectedBrandId",
  selectedCanonicalBrandName: "cdfSelectedCanonicalBrandName",
  extractedBrandEntities: "cdfExtractedBrandEntities",
  extractionAttemptedIdentityMutation: "cdfExtractionAttemptedIdentityMutation",
  userInstructionPresent: "cdfUserInstructionPresent",
  currentUserInstructionSource: "cdfCurrentUserInstructionSource",
  currentUserInstructionFingerprint: "cdfCurrentUserInstructionFingerprint",
  ctiEffectiveInstructionPresent: "cdfCtiEffectiveInstructionPresent",
  productGroundingPresent: "cdfProductGroundingPresent",
  generationIntentHash: "cdfGenerationIntentHash",
  canonicalModelRequestHash: "cdfCanonicalModelRequestHash",
  providerIntentDiagnostics: "cdfProviderIntentDiagnostics",
} as const;

export function hasCdfSessionPhaseMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
): boolean {
  if (!metadata) return false;
  const sessionId =
    typeof metadata.cdfSessionId === "string"
      ? metadata.cdfSessionId.trim()
      : "";
  const phaseId =
    typeof metadata.cdfPhaseId === "string" ? metadata.cdfPhaseId.trim() : "";
  return Boolean(sessionId && phaseId);
}

export function isCanonicalGenerationContextApplied(
  metadata: Readonly<Record<string, unknown>> | undefined,
): boolean {
  return metadata?.[CDF_CANONICAL_CONTEXT_META.applied] === true;
}
