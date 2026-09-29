export type {
  CdfSourceInput,
  CdfSourceInputType,
  CdfRequirement,
  CdfRequirementPriority,
  CdfRequirementCategory,
  CdfRequirementStatus,
  CdfRequirementValue,
  CdfRequirementProvenance,
  CdfRequirementOverride,
  CdfActiveBrief,
  CdfUnresolvedConflict,
  CdfRequirementContextSnapshot,
  CdfExtractionMethod,
  CdfActionRequestBoundary,
} from "./types";

export {
  CDF_REQUIREMENT_PRIORITIES,
  CDF_REQUIREMENT_PRIORITY_RANK,
} from "./types";

export {
  captureSourceAndResolve,
  captureSourceAndResolveSync,
  getRequirementQuery,
  resetCdfRequirementEngineForTests,
  formatRequirementSnapshotForPrompt,
  buildRequirementContextSnapshot,
} from "./service";

export {
  extractRequirements,
  extractRequirementsFromSource,
} from "./extractor";

export {
  resolveActiveRequirements,
  reconstructActiveBriefFromRequirements,
} from "./resolver";

export { checkRequirementFidelity } from "./fidelity-checker";

export {
  validateSourceInput,
  validateRequirement,
  validateActiveBrief,
  validateOverride,
} from "./validation";

export {
  captureSelectionDecision,
  captureApprovalDecision,
} from "./decisions-adapter";

export { CDF_ACTION_IDEMPOTENCY_BOUNDARY } from "./idempotency-boundary";
export type { CdfActionIdempotencyRecord } from "./idempotency-boundary";

export {
  listSourceInputs,
  listRequirements,
  getLatestActiveBrief,
  getActiveBriefByVersion,
  listActiveBriefVersions,
  ensureRequirementBagLoaded,
  resetCdfRequirementStoreForTests,
} from "./store";
