/**
 * UNAGENCY Format & Production Specification catalog (Edition 1.0).
 * Versioned production rules feeding contracts, execution spec, and compliance.
 *
 * Phase 0 also exports Hygiene Reference contracts: structured hygiene checks,
 * universal release gates, prompt-block builder, and productionRuleId binding.
 */

export {
  FORMAT_PRODUCTION_SPEC_DOC_DATE,
  FORMAT_PRODUCTION_SPEC_EDITION,
  FORMAT_PRODUCTION_SPEC_PROVENANCE,
  PRODUCTION_SPEC_STACK_PROVENANCE,
  SERVICE_HYGIENE_REFERENCE_DOC_DATE,
  SERVICE_HYGIENE_REFERENCE_EDITION,
  SERVICE_HYGIENE_REFERENCE_PROVENANCE,
  VISUAL_FIELD_GUIDE_DOC_DATE,
  VISUAL_FIELD_GUIDE_EDITION,
  VISUAL_FIELD_GUIDE_PROVENANCE,
} from "./edition";

export type {
  AuthorityStatus,
  CanvasUnit,
  ColourSpace,
  HygieneEvaluationMethod,
  HygieneWeight,
  ProductionCanvas,
  ProductionExport,
  ProductionHygieneCheck,
  ProductionRule,
  ResolveProductionRuleInput,
  ResolvedProductionRule,
  UniversalGateId,
} from "./types";

export {
  FACEBOOK_RULES,
  INSTAGRAM_RULES,
  LINKEDIN_RULES,
  SERVICE_DEFAULT_RULES,
  SNAPCHAT_RULES,
  SOCIAL_PLATFORM_RULES,
  ALL_PRODUCTION_RULES,
  TIKTOK_RULES,
  WHATSAPP_RULES,
  X_RULES,
  YOUTUBE_RULES,
} from "./rules/social-platforms";

export {
  aspectRatioFromCanvas,
  getProductionRuleById,
  isProductionRuleReleasable,
  listFormatToRuleIdEntries,
  listProductionRules,
  listProductionRulesForPlatform,
  listServiceDefaultRules,
  resolveProductionExportFormats,
  resolveProductionRule,
} from "./resolve-production-rule";

export {
  buildFormatSpecSurfacesSnapshot,
  buildServiceQcLabelCatalog,
  getUniversalQcLabels,
  listSpecPixelMasters,
} from "./format-spec-surfaces";

export type {
  ServiceQcLabelCatalog,
  SpecPixelMaster,
} from "./format-spec-surfaces";

export {
  evaluateProductionReleaseGate,
  isProductionReleaseBlocked,
} from "./production-release-gate";

export type {
  EvaluateProductionReleaseGateInput,
  ProductionReleaseCheck,
  ProductionReleaseCheckStatus,
  ProductionReleaseGateResult,
} from "./production-release-gate";

export {
  evaluateHygieneEvidence,
  isDecisionDeliveryBlocked,
  resolveProductionReleaseDecision,
} from "./production-release-decision";

export type {
  HygieneEvaluationSummary,
  ProductionReleaseDecision,
  ResolveProductionReleaseDecisionInput,
} from "./production-release-decision";

export { resolveSpecAwareDownloadFormats } from "./spec-aware-download-formats";

export {
  buildProductionGateFromExecutionContext,
} from "./build-production-gate-from-context";

export type { BuildProductionGateOverrides } from "./build-production-gate-from-context";

export {
  buildProductionExportFilename,
  sizeTokenFromCanvas,
} from "./production-filename";

export type { BuildProductionExportFilenameInput } from "./production-filename";

export {
  UNIVERSAL_QC_CHECKLIST_LABELS,
  resolveQcChecklistItems,
  resolveQcChecklistLabels,
} from "./qc-checklist";

export type { QcChecklistItem } from "./qc-checklist";

export {
  ALL_UNIVERSAL_GATE_IDS,
  UNIVERSAL_RELEASE_GATES,
  getUniversalReleaseGate,
  resolveUniversalReleaseGates,
} from "./universal-release-gates";

export type { UniversalReleaseGate } from "./universal-release-gates";

export {
  PRODUCTION_PROMPT_BLOCK_HEADER,
  PRODUCTION_PROMPT_BLOCK_VERSION,
  buildProductionPromptBlock,
  buildProductionPromptBlockText,
} from "./production-prompt-block";

export type {
  BuildProductionPromptBlockInput,
  ProductionPromptBlock,
  ProductionPromptBlockSection,
  ProductionPromptBlockSectionId,
} from "./production-prompt-block";

export {
  PRODUCTION_SPEC_BINDING_METADATA_KEY,
  buildProductionSpecBindingFromResolved,
  freezeProductionSpecBinding,
  isProductionSpecBinding,
  readProductionSpecBinding,
  withProductionSpecBinding,
} from "./production-binding";

export type {
  BuildProductionSpecBindingInput,
  ProductionSpecBinding,
} from "./production-binding";

export {
  appendProductionPromptBlockToText,
  applyProductionSpecInstructToMetadata,
  ensureProviderPromptHasProductionSpec,
  promptContainsProductionSpecBlock,
  resolveProductionInstructBundle,
  resolveProductionInstructInputFromMetadata,
} from "./apply-production-spec-instruct";

export type { ProductionInstructBundle } from "./apply-production-spec-instruct";

export {
  PRODUCTION_SPEC_CANARY_SERVICES,
  isProductionSpecCanaryService,
  productionSpecObservesOnly,
  productionSpecShouldEnforce,
  productionSpecShouldInject,
  resolveProductionSpecPromptInject,
  resolveProductionSpecRollout,
} from "./production-spec-rollout";

export type {
  ProductionSpecCanaryService,
  ProductionSpecPromptInjectMode,
  ProductionSpecRollout,
} from "./production-spec-rollout";

export { logProductionSpecTelemetry } from "./production-spec-telemetry";

export type {
  ProductionSpecTelemetryEvent,
  ProductionSpecTelemetryFields,
} from "./production-spec-telemetry";

export {
  evaluateProductionPregenHold,
  readConfirmedOverrideFromMetadata,
} from "./production-spec-pregen";

export type {
  EvaluateProductionPregenHoldInput,
  ProductionPregenHoldResult,
} from "./production-spec-pregen";

/** Rule-authoring helpers (Phase 2+ catalog). */
export { hygieneCheck, rule as defineProductionRule } from "./rules/helpers";

export {
  ADS_HYGIENE,
  BRANDING_HYGIENE,
  EMAIL_HYGIENE,
  EVENT_HYGIENE,
  ILLUSTRATION_HYGIENE,
  MERCHANDISE_HYGIENE,
  PACKAGING_HYGIENE,
  PHOTOGRAPHY_HYGIENE,
  POS_HYGIENE,
  PRESENTATION_HYGIENE,
  PRINT_HYGIENE,
  SOCIAL_HYGIENE,
  STRATEGY_HYGIENE,
  VIDEO_HYGIENE,
  WEB_HYGIENE,
} from "./rules/service-hygiene";

/** Phase 6 — Visual Field Guide catalog + measured / vision evidence. */
export {
  SERVICE_VISUAL_RECIPES,
  VISUAL_FINAL_HYGIENE_LINES,
  VISUAL_FORMAT_LOGIC,
  VISUAL_FORMAT_MASTERS,
  VISUAL_GOOD_PRACTICE,
  VISUAL_IDENTITY_SYSTEM,
  VISUAL_LAYOUT_HYGIENE,
  VISUAL_PLACEMENT_HYGIENE,
  buildVisualFieldGuideJudgeRubric,
  evaluateVisualFieldGuideMeasuredEvidence,
  getServiceVisualRecipe,
  getVisualFieldGuideJudgeRunner,
  listServiceVisualRecipes,
  mergeHygieneEvidenceIds,
  normalizeVisualFieldGuideService,
  registerOpenAiVisualFieldGuideJudgeRunner,
  resolveVisualFieldGuide,
  resolveVisualFieldGuideVisionRollout,
  runVisualFieldGuideJudge,
  setVisualFieldGuideJudgeRunner,
  stampVisualFieldGuideEvidenceOnMetadata,
  visualFieldGuideVisionShouldRun,
  visualFinalHygienePromptLines,
  applyVisualFieldGuideEvidenceAfterImage,
  createOpenAiVisualFieldGuideJudgeRunner,
} from "./visual-field-guide";

export type {
  ApplyVisualFieldGuideEvidenceAfterImageInput,
  ApplyVisualFieldGuideEvidenceAfterImageResult,
  CreateOpenAiVisualFieldGuideJudgeRunnerOptions,
  EvaluateVisualFieldGuideMeasuredInput,
  GoodPracticeRow,
  ResolvedVisualFieldGuide,
  ResolveVisualFieldGuideInput,
  ServiceVisualRecipe,
  StampVisualFieldGuideEvidenceInput,
  StampVisualFieldGuideEvidenceResult,
  VisualFieldGuideJudgeCheckResult,
  VisualFieldGuideJudgeInput,
  VisualFieldGuideJudgeResult,
  VisualFieldGuideJudgeRunner,
  VisualFieldGuideJudgeVerdict,
  VisualFieldGuideMeasuredEvidence,
  VisualFieldGuideVisionRollout,
  VisualFormatLogicPack,
  VisualFormatMaster,
  VisualFormatMasterId,
  VisualIdentitySystemPack,
  VisualLayoutHygienePack,
  VisualPlacementHygienePack,
} from "./visual-field-guide";
