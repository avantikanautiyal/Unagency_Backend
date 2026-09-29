export type {
  ResolvedGenerationContext,
  ResolveGenerationContextInput,
  ResolveGenerationContextResult,
  ResolvedGenerationContextSnapshot,
  CdfContextResolutionStatus,
  CdfContextSource,
  CdfUpstreamReference,
  CdfContextRequirementRef,
  CdfContextSelectionRef,
  CdfContextDecisionRef,
  CdfContextRefinement,
  CdfPhaseContractSlice,
  CdfContextWarning,
  CdfContextProvenance,
} from "./types";

export {
  resolveGenerationContext,
  resolveGenerationContextOrThrow,
} from "./resolve";

export {
  formatResolvedContextForPrompt,
  contextProvenanceMetadata,
} from "./prompt-adapter";

export {
  validateResolvedGenerationContext,
  toContextSnapshot,
} from "./validate";

export { computeContextHash, createContextId } from "./hash";

export {
  filterRequirementsForPhase,
  isBlockingConflictKey,
} from "./phase-scope";

export {
  CDF_GENERATION_PATH_AUDIT,
  type CdfGenerationPathAuditRow,
} from "./generation-path-audit";
