/**
 * Phase 10 — Context Orchestrator (thin coordination boundary).
 */

export type {
  ContextOrchestrationInput,
  ContextOrchestrationResult,
  ContextOrchestrationApplied,
  ContextOrchestrationSkip,
  ContextOrchestrationFailure,
  ContextContributorPresence,
} from "./types";

export { CONTEXT_ORCHESTRATOR_SOURCE } from "./types";

export { orchestrateCanonicalGenerationContext } from "./orchestrate";

export { shouldSkipLegacySemanticPromptMutation } from "./legacy-barrier";

export {
  emitContextOrchestratorAppliedTrace,
  emitContextOrchestratorSkippedTrace,
  emitContextOrchestratorFailedTrace,
  getContextOrchestratorTraceEventsForTests,
  resetContextOrchestratorTracesForTests,
  CONTEXT_ORCHESTRATOR_TRACE_SCOPE,
} from "./trace";
