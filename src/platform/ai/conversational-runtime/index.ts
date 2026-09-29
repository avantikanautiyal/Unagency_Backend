/**
 * Phase 13 — Conversational Runtime Integration.
 * Thin glue: intent, identity stamps, safe inspection, multi-turn harness, traces.
 * Does not invent conversation/artifact stores or a second orchestrator.
 */

export {
  CONVERSATIONAL_RUNTIME_SOURCE,
  buildConversationalGenerationIntent,
  stampConversationalIntentMetadata,
  type ConversationalGenerationIntent,
} from "./intent";

export { resolveCanonicalConversationalInstruction, resolveCanonicalConversationalInstructionDetailed } from "./resolve-instruction";
export type {
  CanonicalInstructionResolution,
  CanonicalInstructionSource,
} from "./resolve-instruction";

export {
  inspectConversationalGenerationContext,
  assertInspectionOmitsSensitiveBodies,
  type ConversationalContextInspection,
} from "./inspect";

export {
  CONVERSATIONAL_LINKAGE_META,
  stampConversationalTurnLinkage,
  readConversationalTurnLinkage,
  deriveConversationalTurnLinkage,
  type ConversationalTurnLinkage,
} from "./linkage";

export {
  runConversationalGenerationTurn,
  runConversationalContinuityProof,
  type ConversationalTurnProofInput,
  type ConversationalTurnProofResult,
  type ConversationalContinuityHarnessResult,
} from "./harness";

export {
  persistConversationalMessage,
  loadPersistedConversationalMessages,
  resetConversationalMessageLedgerForTests,
} from "./conversation-ledger";

export {
  runRealConversationalContinuityE2E,
  assertTurn2ProviderBoundaryFromCmr,
  orchestrateTurnWithoutInjectedUpstream,
  type RealContinuityE2EResult,
  type RealContinuityTurnResult,
} from "./real-continuity-harness";

export {
  inventoryCdfApplicationServices,
  classifyCmrSections,
  CDF_DEEP_INGEST_RUNTIME_SERVICES,
  isLlmGenerationModality,
  isDeterministicModality,
  type CdfServiceInventory,
  type CdfPhaseInventory,
  type AcceptanceRowStatus,
  type AcceptanceSectionStatus,
} from "./acceptance-matrix";

export {
  buildServiceDependencyContract,
  buildAllServiceDependencyContracts,
  hasDeepIngestRuntime,
  classifyDependencyEdge,
  assertNoSilentMetadataOnlyOnContentEdges,
  authoritativeMechanismForContentEdge,
  type CdfServiceDependencyClass,
  type CdfServiceDependencyContract,
  type CdfDependencyEdge,
  type CdfPhaseContractRow,
} from "./dependency-contracts";

export {
  advanceToFirstLlmPhase,
  probeFirstGeneration,
  assertProviderBoundaryFromCmr,
  listInventoryForTests,
  type FirstGenerationProbeResult,
  type AdvancedSession,
} from "./acceptance-harness";

export {
  CONVERSATIONAL_RUNTIME_TRACE_SCOPE,
  emitConversationalGenerationIntentTrace,
  emitConversationalGenerationContextTrace,
  emitConversationalGenerationCompletedTrace,
  emitConversationalGenerationFailedTrace,
  getConversationalRuntimeTraceEventsForTests,
  resetConversationalRuntimeTracesForTests,
  type ConversationalRuntimeTraceEvent,
  type ConversationalRuntimeTraceEventName,
} from "./trace";
