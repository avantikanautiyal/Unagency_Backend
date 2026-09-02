export type {
  ConversationalAction,
  ConversationalClarification,
  ConversationalDecision,
  ConversationalRequirement,
  ConversationalTaskIntelligenceState,
  ConversationalTaskThread,
  ConversationalTurnInput,
  ConversationalTurnObservability,
  ConversationalTurnResolution,
  RequirementPersistence,
  RequirementSource,
  ResolvedReference,
  TaskAlternative,
  TurnConfidence,
} from "./conversational-task-contract";

export { CONVERSATIONAL_TASK_PLANE_VERSION } from "./conversational-task-contract";

export { extractSemanticSignals } from "./semantic-signals";
export type { SemanticSignals } from "./semantic-signals";

export {
  resolveReferences,
  isAmbiguousReference,
} from "./reference-resolution";

export {
  parseRequirementOperations,
  applyRequirementOperations,
  activeRequirements,
  buildEffectiveInstruction,
  resetRequirementCounterForTests,
} from "./requirement-lifecycle";
export type { RequirementOperation } from "./requirement-lifecycle";

export {
  resolveConversationalAction,
  actionRequiresExecution,
  mapActionToLegacyIntent,
} from "./action-resolution";

export {
  emptyTaskIntelligenceState,
  ensureTaskIntelligenceState,
  resolveActiveThread,
  applyExecutionOutcomeToThread,
  updateTaskStateThread,
  resetThreadCounterForTests,
} from "./task-thread-manager";

export { selectRelevantMessages } from "./context-resolution";
export { logConversationalTurnResolution } from "./conversational-observability";
export { resolveConversationalTurn } from "./conversational-turn-resolver";

export type {
  CanonicalExecutionSpecification,
  ContentItemSpec,
  DeliverableFormat,
  ExecutionSpecResolutionState,
  OutputIntentMode,
  ResolvedDeliverable,
  ResolvedField,
  SpecFieldProvenance,
  NegativeConstraintSpec,
  BrandAssetRequirementSpec,
} from "./execution-specification";
export {
  EXECUTION_RESOLUTION_PLANE_VERSION,
  defaultField,
  explicitField,
  field,
} from "./execution-specification";

export { resolveExecutionSpecification, executionSpecOutputKindOverride } from "./execution-spec-resolver";
export type { ExecutionSpecResolverInput } from "./execution-spec-resolver";

export {
  interpretRequirementFields,
  deterministicRequirementFieldInterpreter,
} from "./requirement-field-interpreter";
export type {
  ExtractedRequirementFields,
  RequirementFieldInterpreter,
} from "./requirement-field-interpreter";

export {
  resolveDeliverables,
  serviceSupportsDeliverable,
  defaultDeliverablesForService,
} from "./deliverable-resolver";
export type { DeliverableResolutionResult } from "./deliverable-resolver";

export {
  userTaskRequirementsFromExecutionSpec,
  evaluateDeliverableCompliance,
  evaluateDeliverableComplianceAsync,
} from "./deliverable-compliance";
export type {
  DeliverableComplianceReport,
  DeliverableComplianceResult,
  ComplianceMeasurementMethod,
  RequirementComplianceStatus,
} from "./deliverable-compliance";

export {
  extractNegativeConstraintsFromMessage,
  mergeNegativeConstraints,
  negativeConstraintSpec,
  formatNegativeConstraintForProvider,
  constraintObservabilitySummary,
} from "./requirement-enforcement";
export type {
  RequirementEnforcement,
} from "./requirement-enforcement";

export { logExecutionSpecResolution, EXECUTION_SPEC_TRACE_PREFIX } from "./execution-spec-observability";

export type { ExecutionSpecSnapshot } from "./execution-spec-snapshot";
export {
  freezeExecutionSpecSnapshot,
  readExecutionSpecSnapshot,
  readExecutionSpecFromMetadata,
  resolveBriefObjectiveFromMetadata,
  stampExecutionSpecMetadata,
  executionSpecObservabilitySummary,
  requirementComplianceObservabilitySummary,
} from "./execution-spec-snapshot";

export {
  applyExecutionSpecHandoff,
  shouldSkipEffectiveInstructionPromptReplace,
} from "./execution-spec-handoff";

export {
  isRouteVisualProductAction,
  requirementConstraintFingerprint,
  hardConstraintConceptsFromSpec,
  resolveProviderPromptConstraintStatus,
  executionSpecTraceSummary,
  logRequirementConstraintTrace,
  resolveFinalProviderFacingPrompt,
  classifyRequirementFailureBoundary,
  providerConstraintBlockFromSpec,
} from "./requirement-constraint-trace";
export type {
  RequirementHandoffStatus,
  RequirementTracePhase,
  RequirementFailureBoundary,
} from "./requirement-constraint-trace";

export {
  auditPromptTransformation,
  buildForensicRequirementRecords,
  classifyForensicDiagnosis,
  detectConflictingVisualLanguage,
  extractHardConstraintBlockFromInstruction,
  hardConstraintBlockPresent,
  leafConstraintPresent,
  logForensicImageConstraintAudit,
  negativeConstraintBlockFromHandoff,
  negativeConstraintBlockFromMetadata,
  promptFingerprint,
  sanitizeProviderWireBody,
} from "./forensic-image-constraint-audit";
export type {
  ForensicDiagnosis,
  ForensicPromptStage,
  ForensicRequirementRecord,
} from "./forensic-image-constraint-audit";

export type {
  VisualOperationKind,
  VisualOperationSpec,
  CanonicalReferenceInput,
} from "./artifact-reference-input";
export {
  isArtifactGroundedOperation,
  referenceArtifactIdFromOperation,
} from "./artifact-reference-input";

export type { ResolvedArtifactReference } from "./artifact-reference-bridge";
export {
  attachReferenceToExecutionMetadata,
  resolveArtifactReferenceForProvider,
  resolveArtifactReferenceFromInlineRef,
  resolveArtifactReferenceFromStore,
} from "./artifact-reference-bridge";

export type {
  VisualModificationPlan,
  VisualModificationUnsupported,
} from "./visual-modification-plan";
export {
  buildVisualOperationSpec,
  isGroundedVisualAction,
  planArtifactGroundedModification,
  assertReferenceCapableProviderOrUnsupported,
  pickReferenceCapableCandidate,
  reorderImageCandidatesForReferenceEdit,
} from "./visual-modification-plan";

export type {
  VisualRequirementEvaluationMode,
  VisualRequirementComplianceStatus,
  VisualRequirementEvaluationResult,
  VisualRequirementEvaluatorProvenance,
  VisualRequirementJudge,
} from "./visual-requirement-evaluator";
export {
  classifyVisualConstraintEvaluationMode,
  evaluateVisualNegativeConstraint,
  evaluateVisualNegativeConstraints,
  mapVisualRequirementToComplianceStatus,
  registerVisualRequirementJudge,
  resetVisualRequirementJudgeForTests,
  VISUAL_REQUIREMENT_EVALUATOR_VERSION,
} from "./visual-requirement-evaluator";
