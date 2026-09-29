/**
 * Deterministic communication composition — public API.
 */

export type {
  VisualGenerationResult,
  CommunicationCompositionInput,
  ComposedDeliverable,
  ComposeDeliverableResult,
  CompositionLayerEvidence,
  CompositionCanvasSpec,
  CompositionSafeArea,
  CompositionPixelBounds,
  CompositionBrandMarkInput,
  CompositionTypography,
  CompositionFailure,
  CompositionFailureCode,
  CanvasVerificationInput,
} from "./types";

export {
  composeDeliverable,
  composedDiffersFromVisualPlate,
  assertVisualIsNotAcceptanceSubject,
} from "./compose-raster";

export {
  evaluateCanvasCompliance,
  type CanvasVerificationResult,
  type CanvasComplianceStatus,
} from "./canvas-verification";

export {
  BITMAP_FONT_FAMILY,
  fitTextDeterministic,
  wrapTextDeterministic,
} from "./bitmap-font";

export {
  normalizeVisualGenerationResult,
} from "./normalize-visual-generation";

export {
  contractRequiresDeterministicComposition,
  buildCommunicationCompositionInput,
  resolveSharedCompositionAuthority,
  type SharedCompositionAuthority,
} from "./composition-authority-input";

export {
  acceptComposedLeaf,
  buildStructuralEvidenceFromComposed,
  enrichCanonicalCandidateWithComposedDeliverable,
  type LeafCompositionAcceptanceResult,
  type LeafCompositionIdentity,
} from "./accept-composed-leaf";

export {
  runIndependentFanoutCompositionGroup,
  type FanoutCompositionGroupResult,
  type FanoutLeafVisualInput,
  type FanoutLeafGroupOutcome,
} from "./run-fanout-composition-group";

export {
  tryDeterministicCompositionCanonicalBridge,
  type DeterministicCompositionBridgeResult,
} from "./canonical-composition-bridge";

export {
  resolveBrandMarkFromExecutionAuthority,
} from "./resolve-brand-mark-authority";

export {
  runLiveCertificationPreflight,
  buildLiveCertFanoutPlan,
  LIVE_CERT_REQUIRED_TARGETS,
  type LiveCertificationPreflightReport,
  type PreflightCheck,
} from "./live-certification-preflight";

export {
  loadExecutionMediaBytes,
  persistComposedDeliverableToVault,
  resolveComposedVaultBytesForTests,
} from "./persist-composed-media";
