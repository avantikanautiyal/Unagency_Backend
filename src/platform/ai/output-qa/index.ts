/**
 * Phase 16 — Canonical Output QA public surface.
 */

export {
  OUTPUT_QA_CONTRACT_VERSION,
  type OutputQAStatus,
  type OutputQASeverity,
  type OutputQAErrorCode,
  type OutputQADiagnostic,
  type OutputQACheckId,
  type OutputQAProvidedArtifact,
  type OutputQAContext,
  type OutputQAPolicy,
  type CanonicalOutputQAInput,
  type CanonicalOutputQAResult,
  mayAdvanceFromOutputQA,
} from "./types";

export {
  validateCanonicalActionOutput,
  getOutputQAContractVersion,
  assertOutputQAAllowsAdvancement,
} from "./validate";

export {
  validateProvidedArtifactSchema,
  extractArtifactFromExecutionValue,
} from "./adapters/artifact";

export { emitOutputQATrace } from "./trace";
