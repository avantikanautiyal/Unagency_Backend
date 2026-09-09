/**
 * UNAGENCY Visual Field Guide catalog (Edition 1.0) — Phase 6.
 */

export {
  VISUAL_FIELD_GUIDE_DOC_DATE,
  VISUAL_FIELD_GUIDE_EDITION,
  VISUAL_FIELD_GUIDE_PROVENANCE,
} from "../edition";

export type {
  GoodPracticeRow,
  ResolvedVisualFieldGuide,
  ServiceVisualRecipe,
  VisualFormatLogicPack,
  VisualFormatMaster,
  VisualFormatMasterId,
  VisualIdentitySystemPack,
  VisualLayoutHygienePack,
  VisualPlacementHygienePack,
} from "./types";

export {
  VISUAL_FORMAT_LOGIC,
  VISUAL_FORMAT_MASTERS,
  VISUAL_IDENTITY_SYSTEM,
  VISUAL_LAYOUT_HYGIENE,
  VISUAL_PLACEMENT_HYGIENE,
} from "./identity-system";

export {
  VISUAL_FINAL_HYGIENE_LINES,
  VISUAL_GOOD_PRACTICE,
} from "./good-practice";

export {
  SERVICE_VISUAL_RECIPES,
  getServiceVisualRecipe,
  listServiceVisualRecipes,
  normalizeVisualFieldGuideService,
} from "./service-visual-recipes";

export {
  resolveVisualFieldGuide,
  visualFinalHygienePromptLines,
} from "./resolve-visual-field-guide";

export type { ResolveVisualFieldGuideInput } from "./resolve-visual-field-guide";

export {
  evaluateVisualFieldGuideMeasuredEvidence,
  mergeHygieneEvidenceIds,
} from "./measured-evidence";

export type {
  EvaluateVisualFieldGuideMeasuredInput,
  VisualFieldGuideMeasuredEvidence,
} from "./measured-evidence";

export {
  stampVisualFieldGuideEvidenceOnMetadata,
} from "./stamp-evidence";

export type {
  StampVisualFieldGuideEvidenceInput,
  StampVisualFieldGuideEvidenceResult,
} from "./stamp-evidence";

export {
  applyVisualFieldGuideEvidenceAfterImage,
} from "./apply-after-image";

export type {
  ApplyVisualFieldGuideEvidenceAfterImageInput,
  ApplyVisualFieldGuideEvidenceAfterImageResult,
} from "./apply-after-image";

export {
  createOpenAiVisualFieldGuideJudgeRunner,
  registerOpenAiVisualFieldGuideJudgeRunner,
} from "./openai-vision-runner";

export type { CreateOpenAiVisualFieldGuideJudgeRunnerOptions } from "./openai-vision-runner";

export {
  resolveVisualFieldGuideVisionRollout,
  visualFieldGuideVisionShouldRun,
} from "./vision-rollout";

export type { VisualFieldGuideVisionRollout } from "./vision-rollout";

export {
  buildVisualFieldGuideJudgeRubric,
  getVisualFieldGuideJudgeRunner,
  runVisualFieldGuideJudge,
  setVisualFieldGuideJudgeRunner,
} from "./vision-judge";

export type {
  VisualFieldGuideJudgeCheckResult,
  VisualFieldGuideJudgeInput,
  VisualFieldGuideJudgeResult,
  VisualFieldGuideJudgeRunner,
  VisualFieldGuideJudgeVerdict,
} from "./vision-judge";
