export {
  EVALUATION_PLANE_VERSION,
  EVALUATION_PLANE_ID,
} from "./evaluation-plane-version";

export type {
  EvaluationContext,
  EvaluationPlaneInput,
  EvaluationPlaneResult,
  EvaluationStageTrace,
  EvaluationMode,
  MeasurementStatus,
  ObjectiveMetric,
  ModalityCapabilities,
  ApplicabilityRecord,
  IndependentJudgementInput,
  IndependentJudgementResult,
} from "./types";

export { resolveModalityProfile, resolveDimensionApplicability } from "./modality-profiles";
export { runEvaluationPlane } from "./evaluation-plane";
export { bridgeToArtifactEvaluationBundle } from "./step2-bridge";

export {
  evaluateTextAdapter,
  evaluateImageAdapter,
  evaluateDocumentAdapter,
  evaluatePresentationAdapter,
  evaluateHtmlAdapter,
  evaluateEmailAdapter,
  evaluateVideoAdapter,
  selectAdapterForContext,
} from "./adapters/modality-adapters";
