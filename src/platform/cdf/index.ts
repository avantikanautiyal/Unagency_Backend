export type {
  CdfApprovedPhase,
  CdfFlowPhase,
  CdfGeneratorKind,
  CdfModeOwnership,
  CdfPhaseType,
  CdfRouteCard,
  CdfServiceConfig,
  CdfSessionState,
  CdfSessionArtifactRef,
  CdfTransitionAction,
  CdfTransitionRequest,
  CdfTransitionResult,
  CdfUiHint,
} from "./types";

export {
  CDF_CONFIG_BY_ID,
  CDF_SERVICE_CONFIGS,
  listCdfServiceIds,
  resolveCdfServiceConfig,
  socialMediaConfig,
} from "./service-configs";

export {
  CDF_CONTRACT_VERSION,
  getCdfCanonicalRegistry,
  computeCdfContractHash,
  listCdfCanonicalServiceIds,
  resolveCdfCanonicalService,
  validateCdfCanonicalRegistry,
  assertValidCdfCanonicalRegistry,
  canonicalPhaseAllowsNonVisualReady,
} from "./canonical";

export {
  applyCdfTransition,
  getCdfSessionResult,
} from "./transition-service";

export {
  executeCdfAction,
  executeCdfActionAsync,
  prepareTransition,
} from "./state-machine/execute-action";

export {
  CdfTransitionError,
  cdfError,
  type CdfTransitionErrorCode,
} from "./state-machine/errors";

export * from "./requirements";

export * from "./context-resolver";

export * from "./artifacts";

export * from "./generation-artifact";

export * from "./generation-validation";

export * from "./rendering";

export * from "./refinement";

export * from "./presentation-runtime";

export * from "./packaging-runtime";

export * from "./social-media-runtime";

export * from "./generation-context";

export {
  CDF_EARLY_TEXT_PHASE_IDS,
  CDF_LATE_STRUCTURED_PHASE_IDS,
  shouldOmitCdfStructuredStamp,
} from "./phase-scoped-create";

export {
  requiresCanonicalStructuredSchema,
  requiresCanonicalEmissionSchema,
  stampCanonicalStructuredOutputMetadata,
  assertCanonicalStructuredSchemaBeforeProvider,
  hasUsableStructuredOutputSchema,
  resolveCdfStructuredOutputStamp,
  isCanonicalStructuredPhaseMetadata,
} from "./structured-output-contract";

export {
  applyCdfExecutionAuthority,
  reassertCdfExecutionAuthority,
  outputKindFromCdfContract,
  capabilityFromCdfContract,
  resolveCdfContractFromMetadata,
  resolveExecutionOutputAuthority,
  resolvePhaseAuthoritativeExecutionSpecOutputKind,
  kindsConflict,
  cdfContractIsNonVisual,
  cdfExecutionRequiresMediaArtifact,
  cdfContractAuthorizesDocumentExport,
  isCdfExecutionAuthorityApplied,
  CDF_EXECUTION_CONTRACT_CONFLICT,
  CDF_EXECUTION_AUTHORITY_META,
  CDF_SEALED_SEMANTIC_KEYS,
} from "./execution-authority";

export {
  resolvePhaseCompletionForApproval,
  resolvePhaseProgressStatuses,
  isPhaseAuthoritativelyComplete,
  logApprovalPrecondition,
  requiredRoleForApprovalPrecondition,
  type CdfPhaseCompletionResolution,
  type CdfPhaseProgressStatus,
} from "./lifecycle/phase-completion";

export {
  cdfDependencySatisfied,
  assertCdfPhaseDependencies,
  sessionHasCanonicalArtifactRefs,
  selectRequiresExactArtifactIdentity,
} from "./lifecycle/dependency-satisfaction";

export {
  createCdfSessionId,
  deleteCdfSession,
  ensureCdfSessionLoaded,
  getCdfSession,
  persistCdfSession,
  persistCdfSessionCas,
  compareAndSwapCdfSession,
  flushCdfSessionDurability,
  resolveCdfSessionDurabilityMode,
  resetCdfSessionsForTests,
  saveCdfSession,
} from "./session-store";
