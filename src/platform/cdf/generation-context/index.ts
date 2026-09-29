/**
 * Phase 2 — Canonical Generation Context Bridge (CDF create path).
 */

export {
  CDF_CANONICAL_GENERATION_CONTEXT_ENV,
  CDF_CANONICAL_CONTEXT_META,
  isCdfCanonicalGenerationContextEnabled,
  hasCdfSessionPhaseMetadata,
  isCanonicalGenerationContextApplied,
} from "./flag";

export type {
  UpstreamArtifactRole,
  UpstreamArtifactContext,
  CanonicalGenerationConstraint,
  CanonicalGenerationOutputContract,
  CanonicalGenerationRequest,
  GenerationContextErrorCode,
  ApplyCanonicalGenerationContextInput,
  ApplyCanonicalGenerationContextResult,
} from "./types";

export {
  createArtifactContextLoader,
  loadUpstreamFromSessionRef,
  toUpstreamArtifactContext,
  mapSessionRoleToUpstreamRole,
} from "./artifact-context-loader";

export {
  resolveUpstreamArtifactsForPhase,
  type UpstreamOptionalSkip,
} from "./resolve-dependencies";

export {
  resolveArtifactContextForGeneration,
  rehydrateReferencedArtifacts,
  computeArtifactContextHash,
  buildArtifactContextObservability,
  summarizeArtifactContextForTrace,
  isSessionAuthorizedArtifactId,
  type ArtifactContextRehydrationResult,
  type ArtifactContextObservability,
  type ArtifactContextSkip,
} from "./resolve-artifact-context";

export { compileCanonicalGenerationRequest } from "./compile";

export {
  compileCanonicalModelRequestFromGeneration,
  assembleCanonicalModelRequest,
  detectCanonicalSectionsFromModelRequest,
} from "./compile-model-request";

export {
  resolveCanonicalAssemblyEnrichments,
  type CanonicalAssemblyEnrichments,
  type CanonicalProductionSpecEnrichment,
  type CanonicalOutputRequirementsEnrichment,
} from "./resolve-assembly-enrichments";

export {
  resolveCanonicalGenerationReferences,
  expandExplicitVersionCandidates,
  summarizeGenerationReferencesForTrace,
} from "./resolve-references";

export {
  resolveCanonicalWorkingMemory,
  conversationMessagesFromMetadata,
  summarizeWorkingMemoryForTrace,
} from "./resolve-working-memory";

export {
  resolveWorkingMemoryConversationHandoff,
  workingMemoryHandoffObservability,
  type WorkingMemoryConversationHandoff,
} from "./resolve-conversation-handoff";

export {
  selectConversationWorkingMemory,
  DEFAULT_WORKING_MEMORY_BOUNDS,
  WORKING_MEMORY_SELECTION_METHOD,
  type ConversationWorkingMemory,
  type ConversationWorkingMemoryItem,
  type WorkingMemorySourceMessage,
} from "../../ai/conversation-working-memory";

export {
  resolveGenerationReferences,
  buildGenerationReferenceCandidates,
  type GenerationReferenceResolutionResult,
  type ResolvedGenerationReference,
} from "../../ai/reference-resolution";

export {
  resolveSelectedSemanticChoices,
  extractChoiceArrayFromArtifactData,
  artifactDataLooksLikeChoiceSet,
  choiceHasAuthoritativeCommunicationFields,
  selectSemanticChoiceForComposition,
  type SelectedSemanticChoice,
  type ResolveSelectedSemanticChoicesResult,
} from "./resolve-selected-choice";

export {
  resolveCanonicalBrandContextFromMetadata,
  resolveCanonicalProductGroundingFromMetadata,
  inspectBrandIdentityAuthority,
} from "./resolve-brand-product-context";

export { composeGenerationSemanticObjective } from "./compose-semantic-objective";
export {
  compileDeliverableComposition,
  resolveAndCompileDeliverableComposition,
  type CompiledCreativeComposition,
  type CompositionSlot,
} from "./compile-deliverable-composition";
export {
  resolveDeliverableCompositionForPhase,
  type DeliverableCompositionResolution,
} from "./resolve-deliverable-composition";
export {
  assertRequiredOnAssetCompositionInCmr,
  assertRequiredCommunicationValuesResolved,
  contractRequiresOnAssetCommunication,
  compiledRequiresOnAssetCommunication,
  qualifyProductionSpecForRequiredComposition,
  provenanceFromSlotSource,
  type CompositionValueProvenance,
  type RequiredRenderedCommunicationBlock,
  type RequiredRenderedCommunicationSurface,
} from "./composition-authority";
export {
  composeDeliverableSemantics,
  type DeliverableSemantics,
  type DeliverableSemanticsInput,
} from "./compose-deliverable-semantics";
export {
  projectUpstreamArtifactDataForGeneration,
  type ArtifactProjectionMode,
} from "./project-upstream-for-generation";

export {
  assessCreativeDirectionCompleteness,
  type CreativeDirectionCompleteness,
  type CreativeDirectionFieldAssessment,
  type CreativeDirectionActionability,
} from "./creative-direction-completeness";

export {
  BRAND_FACT_RELEVANCE,
  brandFactCategoriesForProjection,
  isBrandFactRelevantForProjection,
  type BrandFactProjectionContext,
  type BrandFactRelevanceCategory,
} from "./brand-fact-relevance";

export {
  buildProviderGenerationIntentDiagnostics,
  type ProviderGenerationIntentDiagnostics,
} from "./provider-intent-diagnostics";

export {
  bindCanonicalGenerationRequestToPrompt,
  formatUpstreamArtifactForPrompt,
} from "./bind-prompt";

export {
  computeGenerationContextHash,
  summarizeUpstreamForObservability,
} from "./hash";

export {
  resolveCanonicalArtifactVisualBytes,
  extractVaultAssetIdFromArtifactData,
  isVisualMediaArtifactType,
  downstreamRequiresVisualMediaInput,
} from "./canonical-visual-bytes";

export {
  applyUpstreamVisualArtifactHandoff,
  CDF_UPSTREAM_ARTIFACT_UNRESOLVABLE,
} from "./upstream-visual-handoff";

export {
  resolveUpstreamArtifactContext,
  resolveAllUpstreamArtifactContexts,
  assertUpstreamSemanticProjectionForOnAsset,
  upstreamContinuityDiagnostics,
  type ResolvedUpstreamArtifactContext,
  type UpstreamSemanticProjectionStatus,
} from "./resolve-upstream-artifact-context";

export {
  resolveCanonicalMultimodalContext,
  projectCanonicalMultimodalForProviders,
  descriptorsFromExecutionMetadata,
  descriptorsFromConversationMessages,
  summarizeMultimodalForTrace,
} from "./resolve-multimodal-context";

export {
  selectMultimodalContext,
  projectMultimodalForProvider,
  DEFAULT_MULTIMODAL_BOUNDS,
  MULTIMODAL_SELECTION_METHOD,
  XLSX_MIME,
  DOCX_MIME,
  PPTX_MIME,
  PDF_MIME,
  type MultimodalContext,
  type MultimodalContextItem,
  type MultimodalInputDescriptor,
} from "../../ai/multimodal-context";

export {
  tryApplyCanonicalGenerationContext,
  type CanonicalContextApplyResult,
  type CanonicalContextSkip,
  type CanonicalContextApplied,
} from "./apply";

export {
  orchestrateCanonicalGenerationContext,
  shouldSkipLegacySemanticPromptMutation,
  CONTEXT_ORCHESTRATOR_SOURCE,
  getContextOrchestratorTraceEventsForTests,
  resetContextOrchestratorTracesForTests,
  type ContextOrchestrationResult,
  type ContextOrchestrationInput,
  type ContextContributorPresence,
} from "../../ai/context-orchestrator";

export {
  CANONICAL_SECTION_MARKERS,
  detectCanonicalSectionsPresent,
  emitCanonicalContextCompiledTrace,
  emitCanonicalContextSkippedTrace,
  emitCanonicalContextFailedTrace,
  emitCanonicalProviderBoundaryTrace,
  buildCdfContextDiagnosticPlanes,
  CDF_CONTEXT_DIAGNOSTIC_PLANE_CONTRACT,
  assertCanonicalTraceConsistency,
  assertCanonicalTraceCompleteness,
  getCanonicalGenerationTraceEvents,
  getLatestCanonicalTraceEvent,
  resetCanonicalGenerationTracesForTests,
  type CanonicalSectionsPresent,
  type CanonicalGenerationTraceEvent,
  type CanonicalUpstreamTraceRef,
} from "./trace";

export {
  runCanonicalGenerationRuntimeProof,
  type CanonicalRuntimeProofResult,
  type CanonicalRuntimeProofInput,
} from "./runtime-proof";

export {
  CONVERSATIONAL_RUNTIME_SOURCE,
  buildConversationalGenerationIntent,
  stampConversationalIntentMetadata,
  resolveCanonicalConversationalInstruction,
  resolveCanonicalConversationalInstructionDetailed,
  inspectConversationalGenerationContext,
  assertInspectionOmitsSensitiveBodies,
  runConversationalGenerationTurn,
  runConversationalContinuityProof,
  runRealConversationalContinuityE2E,
  assertTurn2ProviderBoundaryFromCmr,
  persistConversationalMessage,
  loadPersistedConversationalMessages,
  resetConversationalMessageLedgerForTests,
  stampConversationalTurnLinkage,
  readConversationalTurnLinkage,
  deriveConversationalTurnLinkage,
  CONVERSATIONAL_LINKAGE_META,
  getConversationalRuntimeTraceEventsForTests,
  resetConversationalRuntimeTracesForTests,
  inventoryCdfApplicationServices,
  classifyCmrSections,
  CDF_DEEP_INGEST_RUNTIME_SERVICES,
  isLlmGenerationModality,
  isDeterministicModality,
  advanceToFirstLlmPhase,
  probeFirstGeneration,
  assertProviderBoundaryFromCmr,
  buildServiceDependencyContract,
  buildAllServiceDependencyContracts,
  hasDeepIngestRuntime,
  classifyDependencyEdge,
  assertNoSilentMetadataOnlyOnContentEdges,
  authoritativeMechanismForContentEdge,
  type ConversationalGenerationIntent,
  type ConversationalContextInspection,
  type ConversationalTurnLinkage,
  type ConversationalTurnProofResult,
  type RealContinuityE2EResult,
  type CdfServiceInventory,
  type FirstGenerationProbeResult,
  type CdfServiceDependencyContract,
  type CdfServiceDependencyClass,
} from "../../ai/conversational-runtime";
