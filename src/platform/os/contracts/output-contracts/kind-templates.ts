/**
 * Output kind templates — specialized contract schemas per ServiceOutputKind.
 * Each template defines hard requirements, quality dimensions, DoD, and delivery specs.
 */

import type {
  ContractRequirement,
  QualityDimension,
} from "./evaluation-methods";
import type { DeliverableSpec, DefinitionOfDone } from "./types";
import type {
  DownloadFormat,
  ServiceOutputKind,
  ServiceOutputSpec,
} from "../../../config/service-output-map";
import { OUTPUT_CONTRACT_KIND_TEMPLATE_VERSION } from "./versioning";
import { STANDARD_FAILURE_CONDITIONS } from "./failure-model";

export type KindTemplate = {
  readonly kind: ServiceOutputKind;
  readonly version: string;
  readonly contractId: string;
  readonly deliverables: Omit<DeliverableSpec, "supportedFormats" | "defaultFormat">;
  readonly hardRequirements: readonly ContractRequirement[];
  readonly qualityDimensions: readonly QualityDimension[];
  readonly failureConditions: typeof STANDARD_FAILURE_CONDITIONS;
  readonly definitionOfDone: DefinitionOfDone;
  readonly structuredSchemaRef?: string;
};

function req(
  id: string,
  category: ContractRequirement["category"],
  description: string,
  method: ContractRequirement["evaluation"]["method"],
  expectedResult: string,
  severity: ContractRequirement["evaluation"]["severity"] = "high",
  blocksCompletion = true,
): ContractRequirement {
  return {
    id,
    class: "hard",
    category,
    description,
    evaluation: { method, expectedResult, severity, blocksCompletion },
  };
}

function quality(
  id: string,
  label: string,
  definition: string,
  method: QualityDimension["evaluationMethod"],
  threshold: number,
  weight = 1.0,
): QualityDimension {
  return {
    id,
    label,
    definition,
    scoringRange: { min: 0, max: 100 },
    evaluationMethod: method,
    threshold,
    weight,
  };
}

function dod(
  mandatory: string[],
  quality: string[],
  delivery: string[],
): DefinitionOfDone {
  return Object.freeze({
    mandatoryChecks: Object.freeze(mandatory),
    qualityChecks: Object.freeze(quality),
    deliveryChecks: Object.freeze(delivery),
  });
}

const TEXT_TEMPLATE: KindTemplate = {
  kind: "text",
  version: OUTPUT_CONTRACT_KIND_TEMPLATE_VERSION,
  contractId: "kind.text",
  deliverables: {
    primaryArtifact: "text",
    consumableBy: ["user", "delivery"],
  },
  hardRequirements: Object.freeze([
    req("hard.text.non_empty", "content", "Text output must contain substantive copy", "deterministic_validation", "length > 0"),
    req("hard.text.no_unresolved_placeholders", "content", "No unresolved [TODO] or placeholder tokens", "deterministic_validation", "no placeholder tokens"),
  ]),
  qualityDimensions: Object.freeze([
    quality("quality.clarity", "Clarity", "Copy is clear and actionable", "semantic_evaluator", 75),
    quality("quality.voice_tone", "Voice & tone", "Matches brand voice and brief tone", "semantic_evaluator", 70, 1.1),
    quality("quality.structure", "Structure", "Logical structure with headings/sections where appropriate", "semantic_evaluator", 70),
  ]),
  failureConditions: STANDARD_FAILURE_CONDITIONS,
  definitionOfDone: dod(
    ["hard.text.non_empty", "hard.non_empty_output", "hard.brief_addressed"],
    ["quality.clarity", "quality.voice_tone", "quality.brief_adherence"],
    ["hard.deliverable_format_valid"],
  ),
};

const DOCUMENT_TEMPLATE: KindTemplate = {
  kind: "document",
  version: OUTPUT_CONTRACT_KIND_TEMPLATE_VERSION,
  contractId: "kind.document",
  deliverables: {
    primaryArtifact: "document",
    secondaryArtifacts: ["pdf", "docx"],
    consumableBy: ["user", "delivery", "next_system"],
  },
  structuredSchemaRef: "DocumentPlan",
  hardRequirements: Object.freeze([
    req("hard.document.plan_present", "structure", "DocumentPlan structured output must be present", "schema_validation", "DocumentPlan schema valid"),
    req("hard.document.sections", "structure", "Required document sections exist", "artifact_inspection", "all planned sections materialized"),
    req("hard.document.export_pdf", "delivery", "PDF export must succeed", "build_test_execution", "pdf artifact generated"),
  ]),
  qualityDimensions: Object.freeze([
    quality("quality.document_structure", "Document structure", "Logical flow, headings, and section hierarchy", "semantic_evaluator", 75),
    quality("quality.content_depth", "Content depth", "Sufficient depth for document type", "semantic_evaluator", 70),
    quality("quality.brand_adherence", "Brand adherence", "Brand voice and visual identity in document", "semantic_evaluator", 70),
  ]),
  failureConditions: STANDARD_FAILURE_CONDITIONS,
  definitionOfDone: dod(
    ["hard.document.plan_present", "hard.document.sections", "hard.document.export_pdf"],
    ["quality.document_structure", "quality.content_depth"],
    ["hard.deliverable_format_valid"],
  ),
};

const PRESENTATION_TEMPLATE: KindTemplate = {
  kind: "presentation",
  version: OUTPUT_CONTRACT_KIND_TEMPLATE_VERSION,
  contractId: "kind.presentation",
  deliverables: {
    primaryArtifact: "presentation",
    secondaryArtifacts: ["pptx", "pdf"],
    consumableBy: ["user", "delivery"],
  },
  structuredSchemaRef: "PresentationRoutes",
  hardRequirements: Object.freeze([
    req("hard.presentation.routes", "structure", "PresentationRoutes with required decks/slides", "schema_validation", "PresentationRoutes schema valid"),
    req("hard.presentation.slides_exist", "structure", "All contracted slides exist", "artifact_inspection", "slide count matches plan"),
    req("hard.presentation.export", "delivery", "PPTX or PDF export succeeds", "build_test_execution", "pptx or pdf artifact"),
  ]),
  qualityDimensions: Object.freeze([
    quality("quality.visual_hierarchy", "Visual hierarchy", "Clear slide hierarchy and readability", "visual_evaluator", 75),
    quality("quality.narrative_flow", "Narrative flow", "Coherent story arc across slides", "semantic_evaluator", 75),
    quality("quality.brand_adherence", "Brand adherence", "Brand colors, fonts, and tone on slides", "visual_evaluator", 70),
  ]),
  failureConditions: STANDARD_FAILURE_CONDITIONS,
  definitionOfDone: dod(
    ["hard.presentation.routes", "hard.presentation.slides_exist", "hard.presentation.export"],
    ["quality.visual_hierarchy", "quality.narrative_flow"],
    ["hard.deliverable_format_valid"],
  ),
};

const IMAGE_TEMPLATE: KindTemplate = {
  kind: "image",
  version: OUTPUT_CONTRACT_KIND_TEMPLATE_VERSION,
  contractId: "kind.image",
  deliverables: {
    primaryArtifact: "image",
    consumableBy: ["user", "delivery"],
  },
  hardRequirements: Object.freeze([
    req("hard.image.artifact", "deliverable", "Raster image artifact (png/jpg) must exist", "artifact_inspection", "image/png or image/jpeg"),
    req("hard.image.production_not_mockup", "deliverable", "Primary deliverable must be production asset, not device mockup", "visual_evaluator", "no device/frame mockup as primary", "critical"),
    req("hard.mockup_role_consistency", "delivery", "mockupRole must be consistent with output kind", "deterministic_validation", "kind/mockupRole invariant pass"),
  ]),
  qualityDimensions: Object.freeze([
    quality("quality.visual_quality", "Visual quality", "Professional craft, composition, and polish", "visual_evaluator", 75),
    quality("quality.prompt_adherence", "Brief adherence", "Required elements from brief are present", "visual_evaluator", 75, 1.2),
    quality("quality.brand_adherence", "Brand adherence", "Brand colors, style, and identity", "visual_evaluator", 70),
    quality("quality.channel_fit", "Channel/format fit", "Appropriate for target platform and format", "visual_evaluator", 70),
  ]),
  failureConditions: STANDARD_FAILURE_CONDITIONS,
  definitionOfDone: dod(
    ["hard.image.artifact", "hard.mockup_role_consistency", "hard.non_empty_output"],
    ["quality.visual_quality", "quality.prompt_adherence", "quality.channel_fit"],
    ["hard.deliverable_format_valid"],
  ),
};

const IMAGE_MOCKUP_TEMPLATE: KindTemplate = {
  ...IMAGE_TEMPLATE,
  kind: "image_mockup",
  contractId: "kind.image_mockup",
  hardRequirements: Object.freeze([
    req("hard.image.artifact", "deliverable", "Mockup image artifact must exist", "artifact_inspection", "image/png or image/jpeg"),
    req("hard.mockup_role_consistency", "delivery", "mockupRole=primary requires image_mockup kind", "deterministic_validation", "kind=image_mockup, mockupRole=primary"),
    req("hard.mockup.realistic", "visual", "Mockup must realistically present the design", "visual_evaluator", "realistic product/device mockup"),
  ]),
  qualityDimensions: Object.freeze([
    quality("quality.mockup_realism", "Mockup realism", "Realistic placement and lighting", "visual_evaluator", 75),
    quality("quality.product_visibility", "Product visibility", "Design clearly visible in mockup context", "visual_evaluator", 75),
  ]),
};

const IMAGE_3D_MOCKUP_TEMPLATE: KindTemplate = {
  ...IMAGE_MOCKUP_TEMPLATE,
  kind: "image_3d_mockup",
  contractId: "kind.image_3d_mockup",
  hardRequirements: Object.freeze([
    req("hard.image.artifact", "deliverable", "3D mockup image artifact must exist", "artifact_inspection", "image/png or image/jpeg"),
    req("hard.mockup_role_consistency", "delivery", "mockupRole=primary requires image_3d_mockup kind", "deterministic_validation", "kind=image_3d_mockup, mockupRole=primary"),
    req("hard.mockup.3d_environment", "visual", "3D environmental/product visualization", "visual_evaluator", "3D product/environment render"),
  ]),
};

const VIDEO_TEMPLATE: KindTemplate = {
  kind: "video",
  version: OUTPUT_CONTRACT_KIND_TEMPLATE_VERSION,
  contractId: "kind.video",
  deliverables: {
    primaryArtifact: "video",
    consumableBy: ["user", "delivery"],
  },
  hardRequirements: Object.freeze([
    req("hard.video.artifact", "deliverable", "MP4 video artifact must exist", "artifact_inspection", "video/mp4"),
    req("hard.video.playable", "functionality", "Video must be playable without critical errors", "runtime_validation", "decodable mp4"),
  ]),
  qualityDimensions: Object.freeze([
    quality("quality.visual_quality", "Visual quality", "Production value and craft", "visual_evaluator", 75),
    quality("quality.narrative", "Narrative/story", "Clear message and pacing", "semantic_evaluator", 70),
    quality("quality.brand_adherence", "Brand adherence", "Brand identity in video", "visual_evaluator", 70),
  ]),
  failureConditions: STANDARD_FAILURE_CONDITIONS,
  definitionOfDone: dod(
    ["hard.video.artifact", "hard.video.playable"],
    ["quality.visual_quality", "quality.narrative"],
    ["hard.deliverable_format_valid"],
  ),
};

const ANIMATION_TEMPLATE: KindTemplate = {
  ...VIDEO_TEMPLATE,
  kind: "animation",
  contractId: "kind.animation",
  hardRequirements: Object.freeze([
    req("hard.video.artifact", "deliverable", "Animated MP4 or GIF artifact", "artifact_inspection", "video/mp4 or animated image"),
    req("hard.animation.loop", "functionality", "Animation plays smoothly", "runtime_validation", "smooth playback"),
  ]),
  qualityDimensions: Object.freeze([
    quality("quality.motion_craft", "Motion craft", "Smooth, intentional animation", "visual_evaluator", 75),
    quality("quality.visual_quality", "Visual quality", "Frame quality and composition", "visual_evaluator", 75),
  ]),
};

const EMAIL_TEMPLATE: KindTemplate = {
  kind: "email",
  version: OUTPUT_CONTRACT_KIND_TEMPLATE_VERSION,
  contractId: "kind.email",
  deliverables: {
    primaryArtifact: "email_html",
    secondaryArtifacts: ["html"],
    consumableBy: ["user", "delivery", "next_system"],
  },
  structuredSchemaRef: "EmailPlan",
  hardRequirements: Object.freeze([
    req("hard.email.plan", "structure", "EmailPlan structured output present", "schema_validation", "EmailPlan schema valid"),
    req("hard.email.html", "delivery", "Valid HTML email artifact", "artifact_inspection", "text/html email"),
    req("hard.email.responsive", "ux", "Email renders on mobile and desktop", "runtime_validation", "responsive layout"),
  ]),
  qualityDimensions: Object.freeze([
    quality("quality.email_ux", "Email UX", "Scannable layout, clear CTA", "visual_evaluator", 75),
    quality("quality.brand_adherence", "Brand adherence", "Brand in email design", "visual_evaluator", 70),
  ]),
  failureConditions: STANDARD_FAILURE_CONDITIONS,
  definitionOfDone: dod(
    ["hard.email.plan", "hard.email.html", "hard.email.responsive"],
    ["quality.email_ux"],
    ["hard.deliverable_format_valid"],
  ),
};

const EDITED_IMAGE_TEMPLATE: KindTemplate = {
  ...IMAGE_TEMPLATE,
  kind: "edited_image",
  contractId: "kind.edited_image",
  hardRequirements: Object.freeze([
    req("hard.image.artifact", "deliverable", "Edited image artifact exists", "artifact_inspection", "image/png or image/jpeg"),
    req("hard.edit.fidelity", "content", "Edits match brief without unintended changes", "visual_evaluator", "edits match brief"),
  ]),
};

const HUMAN_FORM_TEMPLATE: KindTemplate = {
  ...IMAGE_TEMPLATE,
  kind: "human_form",
  contractId: "kind.human_form",
  hardRequirements: Object.freeze([
    req("hard.image.artifact", "deliverable", "Human-form visual artifact exists", "artifact_inspection", "image/png or image/jpeg"),
    req("hard.human_form.realistic", "visual", "Human representation meets realism requirements", "visual_evaluator", "realistic human form"),
  ]),
  qualityDimensions: Object.freeze([
    quality("quality.anatomy", "Anatomy realism", "Proportions and anatomy correctness", "visual_evaluator", 75),
  ]),
};

const DEFERRED_WEBSITE_TEMPLATE: KindTemplate = {
  kind: "deferred_website",
  version: OUTPUT_CONTRACT_KIND_TEMPLATE_VERSION,
  contractId: "kind.deferred_website",
  deliverables: {
    primaryArtifact: "web_project",
    secondaryArtifacts: ["zip", "html"],
    consumableBy: ["user", "delivery", "next_system"],
  },
  structuredSchemaRef: "WebProject",
  hardRequirements: Object.freeze([
    req("hard.website.project", "structure", "WebProject structured output with stack and files", "schema_validation", "WebProject schema valid"),
    req("hard.website.routes", "functionality", "Required routes/pages exist", "artifact_inspection", "all contracted routes present"),
    req("hard.website.build", "technical", "Project builds successfully", "build_test_execution", "build succeeds"),
    req("hard.website.no_critical_runtime", "functionality", "No critical runtime errors in preview", "runtime_validation", "no critical console errors"),
    req("hard.website.responsive", "ux", "Responsive layout requirements pass", "runtime_validation", "mobile/tablet/desktop layouts"),
  ]),
  qualityDimensions: Object.freeze([
    quality("quality.ux", "UX", "Usability, navigation, and interaction design", "semantic_evaluator", 75),
    quality("quality.visual_quality", "Visual quality", "Visual design and polish", "visual_evaluator", 75),
    quality("quality.accessibility", "Accessibility", "WCAG-oriented accessibility", "accessibility_tooling", 70),
    quality("quality.seo", "SEO", "Meta tags, structure, and SEO basics", "static_analysis", 65),
    quality("quality.performance", "Performance", "Load time and performance basics", "performance_tooling", 65),
    quality("quality.brand_adherence", "Brand adherence", "Brand identity in website", "visual_evaluator", 70),
  ]),
  failureConditions: STANDARD_FAILURE_CONDITIONS,
  definitionOfDone: dod(
    [
      "hard.website.project",
      "hard.website.routes",
      "hard.website.build",
      "hard.website.no_critical_runtime",
      "hard.website.responsive",
    ],
    ["quality.ux", "quality.accessibility", "quality.seo", "quality.performance"],
    ["hard.deliverable_format_valid"],
  ),
};

const DYNAMIC_TEMPLATE: KindTemplate = {
  kind: "dynamic",
  version: OUTPUT_CONTRACT_KIND_TEMPLATE_VERSION,
  contractId: "kind.dynamic",
  deliverables: {
    primaryArtifact: "resolved_deliverable",
    consumableBy: ["user", "delivery"],
  },
  hardRequirements: Object.freeze([
    req(
      "hard.dynamic_modality_resolved",
      "deliverable",
      "Output type must be resolved before execution (not left as dynamic)",
      "deterministic_validation",
      "outputKind != dynamic",
      "critical",
    ),
    req(
      "hard.dynamic.user_clarified",
      "user_task",
      "When askIfVague=true, user requirements must be clarified or inferred with confidence",
      "semantic_evaluator",
      "modality and deliverable type confirmed",
      "high",
    ),
  ]),
  qualityDimensions: Object.freeze([
    quality("quality.requirement_fit", "Requirement fit", "Resolved output matches user intent", "semantic_evaluator", 75),
  ]),
  failureConditions: STANDARD_FAILURE_CONDITIONS,
  definitionOfDone: dod(
    ["hard.dynamic_modality_resolved"],
    ["quality.requirement_fit"],
    ["hard.deliverable_format_valid"],
  ),
};

export const KIND_TEMPLATES: Readonly<Record<ServiceOutputKind, KindTemplate>> =
  Object.freeze({
    text: TEXT_TEMPLATE,
    document: DOCUMENT_TEMPLATE,
    presentation: PRESENTATION_TEMPLATE,
    image: IMAGE_TEMPLATE,
    image_mockup: IMAGE_MOCKUP_TEMPLATE,
    image_3d_mockup: IMAGE_3D_MOCKUP_TEMPLATE,
    video: VIDEO_TEMPLATE,
    animation: ANIMATION_TEMPLATE,
    email: EMAIL_TEMPLATE,
    edited_image: EDITED_IMAGE_TEMPLATE,
    human_form: HUMAN_FORM_TEMPLATE,
    deferred_website: DEFERRED_WEBSITE_TEMPLATE,
    dynamic: DYNAMIC_TEMPLATE,
  });

export function kindTemplateFor(spec: ServiceOutputSpec): KindTemplate {
  return KIND_TEMPLATES[spec.kind];
}

export function deliverableSpecFromKind(
  template: KindTemplate,
  spec: ServiceOutputSpec,
): DeliverableSpec {
  return Object.freeze({
    primaryArtifact: template.deliverables.primaryArtifact,
    secondaryArtifacts: template.deliverables.secondaryArtifacts,
    supportedFormats: spec.supportedDownloadFormats,
    defaultFormat: spec.defaultDownloadFormat,
    consumableBy: template.deliverables.consumableBy,
  });
}

export function kindContractId(kind: ServiceOutputKind): string {
  return `kind.${kind}`;
}
