/**
 * CDF 2.0 M4 — Generation validation / requirement fidelity.
 */

export * from "./types";
export * from "./classify";
export * from "./observe";
export * from "./checks";
export * from "./policy";
export {
  resetCdfValidationStoreForTests,
  saveValidationResult,
  listValidationResults,
  getLatestValidationResult,
} from "./store";
export {
  validateCanonicalArtifact,
  revalidateCanonicalArtifact,
  isM4AcceptanceStatus,
} from "./service";
export {
  acceptCandidatePayload,
  type CandidateAcceptanceResult,
  type CandidateAcceptanceOk,
  type CandidateAcceptanceReject,
} from "./accept-candidate";
export { resetValidationCheckIdsForTests } from "./checks";
export {
  observePackagingArtifact,
  isPackagingValidationKey,
} from "./packaging-observe";
export {
  runPackagingStructuralChecks,
  runPackagingDependencyChecks,
} from "./packaging-checks";
export {
  evaluateStructuralCompositionCompliance,
  extractStructuralEvidenceFromCandidate,
  expectedTextsFromExecutionMetadata,
  expectedTextsFromCanonicalModelRequest,
  deriveBlocksCanonicalCompletion,
  type StructuralComplianceStatus,
  type StructuralValidationResult,
  type StructuralArtifactEvidence,
  type StructuralProofLevel,
  type StructuralCriterionResult,
} from "./structural-composition-validation";
export {
  deriveVisualVerificationRequirements,
  normalizeVerificationText,
  renderedTextCoversExpected,
  applyRenderedTextMatchPolicy,
  findVerificationCriterion,
  type VisualVerificationRequirements,
  type VisualVerificationCapabilityId,
  type VisualVerificationCriterion,
  type VisualVerificationClass,
  type CriterionAcceptanceOnUnmet,
  type RenderedTextMatchPolicy,
} from "./visual-verification-requirements";
export {
  PLATFORM_VISUAL_VERIFICATION_CAPABILITIES,
  getPlatformVisualVerificationCapabilities,
  claimForVisualVerificationCapability,
  platformHasVisualVerificationCapability,
  canSatisfyVerificationCriterion,
  setVisualVerificationCapabilityClaim,
  resetVisualVerificationCapabilityClaimsForTests,
} from "./visual-verification-capabilities";
export {
  setRenderedTextProofProducer,
  getRenderedTextProofProducer,
  produceRenderedTextProof,
  nullRenderedTextProofProducer,
  isSuccessfulRenderedTextProof,
  type RenderedTextProof,
  type RenderedTextProofOutcome,
  type RenderedTextProofProducer,
} from "./rendered-text-proof";
export {
  createTesseractRenderedTextProofProducer,
} from "./ocr-tesseract-rendered-text-producer";
export {
  registerProductionRenderedTextProofProducer,
  unregisterProductionRenderedTextProofProducer,
} from "./register-production-rendered-text-proof";

import { resetCdfValidationStoreForTests } from "./store";
import { resetValidationCheckIdsForTests } from "./checks";
import { resetPackagingCheckIdsForTests } from "./packaging-check-ids";

export function resetCdfGenerationValidationForTests(): void {
  resetCdfValidationStoreForTests();
  resetValidationCheckIdsForTests();
  resetPackagingCheckIdsForTests();
}
