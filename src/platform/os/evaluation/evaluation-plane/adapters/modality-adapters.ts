/**
 * Step 7 / Priority 4.2 — Modality evaluation adapters (shared framework, not separate engines).
 */

import type { EvaluationContext, ObjectiveMetric } from "../types";
import type { HydratedArtifact } from "../../artifact-evaluation/types";
import {
  EVALUATION_PLANE_ID,
  EVALUATION_PLANE_VERSION,
} from "../evaluation-plane-version";
import { analyzeEmailHtml } from "../../artifact-evaluation/email-analyzer";
import {
  analyzeAccessibility,
  analyzeBrandAdherence,
  analyzeSeo,
  analyzeVisualHierarchy,
  analyzeVisualQualityFromHtml,
} from "../../artifact-evaluation/html-analyzer";
import {
  analyzeImageBytes,
  analyzeVisualQualityFromImage,
} from "../../artifact-evaluation/image-analyzer";
import { analyzeDocxBytes, analyzePptxBytes } from "../../artifact-evaluation/ooxml-analyzer";
import {
  analyzeDocumentLayout,
  analyzePdfBytes,
} from "../../artifact-evaluation/pdf-analyzer";
import { analyzeVideoBytes } from "../../artifact-evaluation/video-analyzer";
import { scoreBriefRelevance } from "../../output-validation/validators/semantic-evaluator";

export type ModalityAdapterResult = {
  readonly metrics: readonly ObjectiveMetric[];
  readonly htmlContent?: string;
  readonly textContent?: string;
};

function metric(input: {
  metricId: string;
  dimension: string;
  value: number | string | boolean;
  unit?: string;
  threshold?: number;
  status: ObjectiveMetric["status"];
  method: string;
  measurementStatus: ObjectiveMetric["measurementStatus"];
  evidence: readonly string[];
  artifactId?: string;
}): ObjectiveMetric {
  return Object.freeze({
    metricId: input.metricId,
    dimension: input.dimension,
    value: input.value,
    unit: input.unit,
    threshold: input.threshold,
    status: input.status,
    measurementMethod: input.method,
    evaluatorId: EVALUATION_PLANE_ID,
    evaluatorVersion: EVALUATION_PLANE_VERSION,
    measurementStatus: input.measurementStatus,
    evidence: Object.freeze(input.evidence),
    confidence: input.measurementStatus,
    artifactId: input.artifactId,
  });
}

function sectionCount(data: unknown): number | undefined {
  if (!data || typeof data !== "object") return undefined;
  const s = (data as { sections?: unknown }).sections;
  return Array.isArray(s) ? s.length : undefined;
}

function structuredSubject(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const d = data as { subject?: unknown; emailSubject?: unknown };
  const subject = d.subject ?? d.emailSubject;
  return typeof subject === "string" ? subject : undefined;
}

/** Text / copywriting / social content — static semantic metrics. */
export function evaluateTextAdapter(ctx: EvaluationContext): ModalityAdapterResult {
  const preview = ctx.preview ?? "";
  const { score, evidence } = scoreBriefRelevance(preview, ctx.briefObjective);
  const wordCount = preview.trim().split(/\s+/).filter(Boolean).length;
  return Object.freeze({
    textContent: preview,
    metrics: Object.freeze([
      metric({
        metricId: "text.brief_overlap",
        dimension: "quality.ux",
        value: score,
        unit: "percent",
        threshold: 40,
        status: score >= 40 ? "PASS" : "UNVERIFIED",
        method: "semantic_static",
        measurementStatus: "HEURISTIC",
        evidence,
      }),
      metric({
        metricId: "text.word_count",
        dimension: "quality.content",
        value: wordCount,
        unit: "words",
        threshold: 10,
        status: wordCount >= 10 ? "PASS" : "FAIL",
        method: "static",
        measurementStatus: "MEASURED",
        evidence: Object.freeze([`word count=${wordCount}`]),
      }),
    ]),
  });
}

/** Image / mockup / edited image — byte-level static + visual metrics. */
export function evaluateImageAdapter(
  ctx: EvaluationContext,
  artifact: HydratedArtifact,
): ModalityAdapterResult {
  const image = analyzeImageBytes(artifact.bytes, artifact.mimeType);
  const visual = analyzeVisualQualityFromImage(image);
  const metrics: ObjectiveMetric[] = [
    metric({
      metricId: "image.readable",
      dimension: "hard.deliverable_format_valid",
      value: image.integrityOk,
      status: image.integrityOk ? "PASS" : "FAIL",
      method: "artifact_inspection",
      measurementStatus: "MEASURED",
      evidence: image.evidence,
      artifactId: artifact.artifactId,
    }),
    metric({
      metricId: "image.byte_size",
      dimension: "hard.deliverable_format_valid",
      value: image.byteSize,
      unit: "bytes",
      threshold: 100,
      status: image.byteSize > 100 ? "PASS" : "UNVERIFIED",
      method: "artifact_inspection",
      measurementStatus: "MEASURED",
      evidence: Object.freeze([`byteSize=${image.byteSize}`]),
      artifactId: artifact.artifactId,
    }),
    metric({
      metricId: "image.format",
      dimension: "hard.deliverable_format_valid",
      value: image.format ?? "unknown",
      status: image.format ? "PASS" : "UNVERIFIED",
      method: "artifact_inspection",
      measurementStatus: image.format ? "MEASURED" : "NOT_AUTOMATED",
      evidence: image.evidence,
      artifactId: artifact.artifactId,
    }),
    metric({
      metricId: "image.width",
      dimension: "hard.deliverable_format_valid",
      value: image.width ?? 0,
      unit: "px",
      status: image.width ? "PASS" : "UNVERIFIED",
      method: "artifact_inspection",
      measurementStatus: image.evaluated ? "MEASURED" : "NOT_AUTOMATED",
      evidence: image.evidence,
      artifactId: artifact.artifactId,
    }),
    metric({
      metricId: "image.height",
      dimension: "hard.deliverable_format_valid",
      value: image.height ?? 0,
      unit: "px",
      status: image.height ? "PASS" : "UNVERIFIED",
      method: "artifact_inspection",
      measurementStatus: image.evaluated ? "MEASURED" : "NOT_AUTOMATED",
      evidence: image.evidence,
      artifactId: artifact.artifactId,
    }),
    metric({
      metricId: "image.aspect_ratio",
      dimension: "hard.deliverable_format_valid",
      value: image.aspectRatio ?? "unknown",
      status: image.aspectRatio ? "PASS" : "UNVERIFIED",
      method: "artifact_inspection",
      measurementStatus: image.aspectRatio ? "MEASURED" : "NOT_AUTOMATED",
      evidence: image.evidence,
      artifactId: artifact.artifactId,
    }),
    metric({
      metricId: "image.visual_quality",
      dimension: "quality.visual_quality",
      value: visual.score,
      unit: "score",
      threshold: 50,
      status: visual.score >= 50 ? "PASS" : "UNVERIFIED",
      method: "visual_property_static",
      measurementStatus: image.evaluated ? "MEASURED" : "NOT_AUTOMATED",
      evidence: visual.evidence,
      artifactId: artifact.artifactId,
    }),
  ];
  if (image.hasAlpha != null) {
    metrics.push(
      metric({
        metricId: "image.alpha_channel",
        dimension: "hard.deliverable_format_valid",
        value: image.hasAlpha,
        status: "PASS",
        method: "artifact_inspection",
        measurementStatus: "MEASURED",
        evidence: Object.freeze([`PNG alpha=${image.hasAlpha}`]),
        artifactId: artifact.artifactId,
      }),
    );
  }
  if (image.integrityOk === false) {
    metrics.push(
      metric({
        metricId: "image.integrity",
        dimension: "hard.deliverable_format_valid",
        value: false,
        status: "FAIL",
        method: "artifact_inspection",
        measurementStatus: "MEASURED",
        evidence: Object.freeze(["image integrity check failed"]),
        artifactId: artifact.artifactId,
      }),
    );
  }
  metrics.push(
    metric({
      metricId: "image.aesthetic_quality",
      dimension: "quality.visual_quality",
      value: 0,
      unit: "score",
      status: "UNVERIFIED",
      method: "not_automated",
      measurementStatus: "NOT_AUTOMATED",
      evidence: Object.freeze(["subjective aesthetic quality requires MODEL_JUDGED evaluator"]),
      artifactId: artifact.artifactId,
    }),
  );
  return Object.freeze({ metrics: Object.freeze(metrics) });
}

function buildDocumentMetrics(
  ctx: EvaluationContext,
  artifact: HydratedArtifact,
): ObjectiveMetric[] {
  const doc = analyzePdfBytes(artifact.bytes, sectionCount(ctx.structuredOutput));
  const layout = analyzeDocumentLayout(doc);
  return [
    metric({
      metricId: "document.valid_pdf",
      dimension: "hard.deliverable_format_valid",
      value: doc.isValidPdf,
      status: doc.isValidPdf ? "PASS" : "FAIL",
      method: "artifact_inspection",
      measurementStatus: "MEASURED",
      evidence: doc.evidence,
      artifactId: artifact.artifactId,
    }),
    metric({
      metricId: "document.page_count",
      dimension: "quality.visual_hierarchy",
      value: doc.pageCount ?? 0,
      unit: "pages",
      threshold: 1,
      status: (doc.pageCount ?? 0) >= 1 ? "PASS" : "UNVERIFIED",
      method: "artifact_inspection",
      measurementStatus: doc.isValidPdf ? "MEASURED" : "NOT_AUTOMATED",
      evidence: Object.freeze([`pages=${doc.pageCount ?? "?"}`]),
      artifactId: artifact.artifactId,
    }),
    metric({
      metricId: "document.text_present",
      dimension: "quality.content",
      value: (doc.textLength ?? 0) > 0,
      status: (doc.textLength ?? 0) > 0 ? "PASS" : "UNVERIFIED",
      method: "artifact_inspection",
      measurementStatus: doc.isValidPdf ? "MEASURED" : "NOT_AUTOMATED",
      evidence: Object.freeze([`textLength=${doc.textLength ?? 0}`]),
      artifactId: artifact.artifactId,
    }),
    metric({
      metricId: "document.title_present",
      dimension: "quality.content",
      value: Boolean(doc.titlePresent),
      status: doc.titlePresent ? "PASS" : "UNVERIFIED",
      method: "artifact_inspection",
      measurementStatus: doc.isValidPdf ? "MEASURED" : "NOT_AUTOMATED",
      evidence: doc.evidence,
      artifactId: artifact.artifactId,
    }),
    metric({
      metricId: "document.layout_score",
      dimension: "quality.visual_quality",
      value: layout.score,
      unit: "score",
      threshold: 40,
      status: layout.score >= 40 ? "PASS" : "UNVERIFIED",
      method: "structural_pdf_heuristic",
      measurementStatus: "HEURISTIC",
      evidence: layout.evidence,
      artifactId: artifact.artifactId,
    }),
  ];
}

async function buildDocxMetrics(
  ctx: EvaluationContext,
  artifact: HydratedArtifact,
): Promise<ObjectiveMetric[]> {
  const docx = await analyzeDocxBytes(artifact.bytes, sectionCount(ctx.structuredOutput));
  return [
    metric({
      metricId: "document.valid_docx",
      dimension: "hard.deliverable_format_valid",
      value: docx.isValidDocx === true,
      status: docx.isValidDocx ? "PASS" : "FAIL",
      method: "artifact_inspection",
      measurementStatus: "MEASURED",
      evidence: docx.evidence,
      artifactId: artifact.artifactId,
    }),
    metric({
      metricId: "document.text_present",
      dimension: "quality.content",
      value: (docx.textLength ?? 0) > 0,
      status: (docx.textLength ?? 0) > 0 ? "PASS" : "UNVERIFIED",
      method: "artifact_inspection",
      measurementStatus: docx.isValidDocx ? "MEASURED" : "NOT_AUTOMATED",
      evidence: Object.freeze([`textLength=${docx.textLength ?? 0}`]),
      artifactId: artifact.artifactId,
    }),
    metric({
      metricId: "document.heading_count",
      dimension: "quality.visual_hierarchy",
      value: docx.headingCount ?? 0,
      unit: "count",
      threshold: 1,
      status: (docx.headingCount ?? 0) >= 1 ? "PASS" : "UNVERIFIED",
      method: "artifact_inspection",
      measurementStatus: docx.isValidDocx ? "MEASURED" : "NOT_AUTOMATED",
      evidence: docx.evidence,
      artifactId: artifact.artifactId,
    }),
  ];
}

/** Document / PDF / DOCX — objective structure metrics. */
export async function evaluateDocumentAdapter(
  ctx: EvaluationContext,
  artifacts: readonly HydratedArtifact[],
): Promise<ModalityAdapterResult> {
  const pdf = artifacts.find((a) => a.kind === "pdf");
  const docx = artifacts.find((a) => a.kind === "docx");
  const metrics: ObjectiveMetric[] = [];

  if (pdf) metrics.push(...buildDocumentMetrics(ctx, pdf));
  if (docx) metrics.push(...(await buildDocxMetrics(ctx, docx)));

  if (metrics.length === 0) {
    metrics.push(
      metric({
        metricId: "document.missing_artifact",
        dimension: "hard.deliverable_format_valid",
        value: false,
        status: "FAIL",
        method: "artifact_inspection",
        measurementStatus: "NOT_AUTOMATED",
        evidence: Object.freeze(["no pdf or docx artifact hydrated for document evaluation"]),
      }),
    );
  }

  return Object.freeze({ metrics: Object.freeze(metrics) });
}

function prefixMetrics(
  metrics: readonly ObjectiveMetric[],
  prefix: string,
): readonly ObjectiveMetric[] {
  return Object.freeze(
    metrics.map((m) =>
      metric({
        metricId: m.metricId.replace(/^document\./, `${prefix}.`),
        dimension: m.dimension,
        value: m.value,
        unit: m.unit,
        threshold: m.threshold,
        status: m.status,
        method: m.measurementMethod,
        measurementStatus: m.measurementStatus,
        evidence: m.evidence,
        artifactId: m.artifactId,
      }),
    ),
  );
}

async function buildPptxMetrics(artifact: HydratedArtifact): Promise<ObjectiveMetric[]> {
  const pres = await analyzePptxBytes(artifact.bytes);
  return [
    metric({
      metricId: "presentation.valid_pptx",
      dimension: "hard.deliverable_format_valid",
      value: pres.isValidPptx === true,
      status: pres.isValidPptx ? "PASS" : "FAIL",
      method: "artifact_inspection",
      measurementStatus: "MEASURED",
      evidence: pres.evidence,
      artifactId: artifact.artifactId,
    }),
    metric({
      metricId: "presentation.slide_count",
      dimension: "quality.visual_hierarchy",
      value: pres.slideCount ?? 0,
      unit: "slides",
      threshold: 1,
      status: (pres.slideCount ?? 0) >= 1 ? "PASS" : "UNVERIFIED",
      method: "artifact_inspection",
      measurementStatus: pres.isValidPptx ? "MEASURED" : "NOT_AUTOMATED",
      evidence: pres.evidence,
      artifactId: artifact.artifactId,
    }),
    metric({
      metricId: "presentation.empty_slides",
      dimension: "quality.content",
      value: pres.emptySlideCount ?? 0,
      unit: "count",
      threshold: 0,
      status: (pres.emptySlideCount ?? 0) === 0 ? "PASS" : "UNVERIFIED",
      method: "artifact_inspection",
      measurementStatus: pres.isValidPptx ? "MEASURED" : "NOT_AUTOMATED",
      evidence: pres.evidence,
      artifactId: artifact.artifactId,
    }),
  ];
}

/** Presentation — PDF and/or PPTX artifacts. */
export async function evaluatePresentationAdapter(
  ctx: EvaluationContext,
  artifacts: readonly HydratedArtifact[],
): Promise<ModalityAdapterResult> {
  const metrics: ObjectiveMetric[] = [];
  const pdf = artifacts.find((a) => a.kind === "pdf");
  const pptx = artifacts.find((a) => a.kind === "pptx");

  if (pdf) {
    metrics.push(...prefixMetrics(buildDocumentMetrics(ctx, pdf), "presentation"));
  }
  if (pptx) {
    metrics.push(...(await buildPptxMetrics(pptx)));
  }

  if (metrics.length === 0) {
    metrics.push(
      metric({
        metricId: "presentation.missing_artifact",
        dimension: "hard.deliverable_format_valid",
        value: false,
        status: "FAIL",
        method: "artifact_inspection",
        measurementStatus: "NOT_AUTOMATED",
        evidence: Object.freeze(["no pdf or pptx artifact hydrated for presentation evaluation"]),
      }),
    );
  }

  metrics.push(
    metric({
      metricId: "presentation.text_overflow",
      dimension: "quality.ux",
      value: 0,
      status: "UNVERIFIED",
      method: "not_automated",
      measurementStatus: "NOT_AUTOMATED",
      evidence: Object.freeze(["text overflow requires rendered slide inspection — NOT_AUTOMATED"]),
      artifactId: pptx?.artifactId ?? pdf?.artifactId,
    }),
  );

  return Object.freeze({ metrics: Object.freeze(metrics) });
}

/** Website HTML — SEO, a11y, visual hierarchy from rendered HTML. */
export function evaluateHtmlAdapter(
  ctx: EvaluationContext,
  html: string,
  artifactId?: string,
): ModalityAdapterResult {
  const isWebsite = (ctx.outputKind ?? "").toLowerCase() === "deferred_website";
  const seo = isWebsite ? analyzeSeo(html) : undefined;
  const a11y = analyzeAccessibility(html);
  const hierarchy = analyzeVisualHierarchy(html);
  const visual = analyzeVisualQualityFromHtml(html);
  const brand = analyzeBrandAdherence({
    html,
    brandColors: ctx.brandColors,
    brandPreferredTerms: ctx.brandPreferredTerms,
    brandAvoidTerms: ctx.brandAvoidTerms,
  });

  const metrics: ObjectiveMetric[] = [
    metric({
      metricId: "html.accessibility_score",
      dimension: "quality.accessibility",
      value: a11y.score,
      unit: "score",
      threshold: 60,
      status: a11y.criticalCount > 0 ? "FAIL" : a11y.score >= 60 ? "PASS" : "UNVERIFIED",
      method: "accessibility_heuristic",
      measurementStatus: "HEURISTIC",
      evidence: a11y.evidence,
      artifactId,
    }),
    metric({
      metricId: "html.visual_hierarchy",
      dimension: "quality.visual_hierarchy",
      value: hierarchy.score,
      unit: "score",
      threshold: 50,
      status: hierarchy.score >= 50 ? "PASS" : "UNVERIFIED",
      method: "visual_heuristic",
      measurementStatus: "HEURISTIC",
      evidence: hierarchy.evidence,
      artifactId,
    }),
    metric({
      metricId: "html.visual_quality",
      dimension: "quality.visual_quality",
      value: visual.score,
      unit: "score",
      threshold: 50,
      status: visual.score >= 50 ? "PASS" : "UNVERIFIED",
      method: "visual_heuristic",
      measurementStatus: "HEURISTIC",
      evidence: visual.evidence,
      artifactId,
    }),
  ];

  if (seo) {
    metrics.push(
      metric({
        metricId: "html.seo_score",
        dimension: "quality.seo",
        value: seo.score,
        unit: "score",
        threshold: 60,
        status: seo.score >= 60 ? "PASS" : "FAIL",
        method: "seo_static",
        measurementStatus: "MEASURED",
        evidence: seo.evidence,
        artifactId,
      }),
    );
  }

  if (brand.evaluated) {
    metrics.push(
      metric({
        metricId: "html.brand_adherence",
        dimension: "quality.brand_adherence",
        value: brand.score,
        unit: "score",
        threshold: 50,
        status: brand.score >= 50 ? "PASS" : "UNVERIFIED",
        method: "brand_heuristic",
        measurementStatus: "HEURISTIC",
        evidence: brand.evidence,
        artifactId,
      }),
    );
  }

  return Object.freeze({ metrics: Object.freeze(metrics), htmlContent: html });
}

/** Email — objective content checks plus shared HTML heuristics. */
export function evaluateEmailAdapter(
  ctx: EvaluationContext,
  html: string,
  artifactId?: string,
): ModalityAdapterResult {
  const email = analyzeEmailHtml({
    html,
    subject: structuredSubject(ctx.structuredOutput),
  });
  const htmlResult = evaluateHtmlAdapter(ctx, html, artifactId);

  const emailMetrics: ObjectiveMetric[] = [
    metric({
      metricId: "email.html_valid",
      dimension: "hard.deliverable_format_valid",
      value: email.htmlValid,
      status: email.htmlValid ? "PASS" : "FAIL",
      method: "email_static",
      measurementStatus: "MEASURED",
      evidence: email.evidence,
      artifactId,
    }),
    metric({
      metricId: "email.subject_present",
      dimension: "quality.content",
      value: email.subjectPresent,
      status: email.subjectPresent ? "PASS" : "UNVERIFIED",
      method: "email_static",
      measurementStatus: "MEASURED",
      evidence: email.evidence,
      artifactId,
    }),
    metric({
      metricId: "email.content_present",
      dimension: "quality.content",
      value: email.contentPresent,
      status: email.contentPresent ? "PASS" : "FAIL",
      method: "email_static",
      measurementStatus: "MEASURED",
      evidence: email.evidence,
      artifactId,
    }),
    metric({
      metricId: "email.cta_present",
      dimension: "quality.ux",
      value: email.ctaPresent,
      status: email.ctaPresent ? "PASS" : "UNVERIFIED",
      method: "email_static",
      measurementStatus: "MEASURED",
      evidence: email.evidence,
      artifactId,
    }),
    metric({
      metricId: "email.broken_image_refs",
      dimension: "hard.deliverable_format_valid",
      value: email.brokenImageRefs,
      unit: "count",
      threshold: 0,
      status: email.brokenImageRefs === 0 ? "PASS" : "FAIL",
      method: "email_static",
      measurementStatus: "MEASURED",
      evidence: email.evidence,
      artifactId,
    }),
    metric({
      metricId: "email.viewport_meta",
      dimension: "quality.ux",
      value: email.viewportMeta,
      status: email.viewportMeta ? "PASS" : "UNVERIFIED",
      method: "email_static",
      measurementStatus: "MEASURED",
      evidence: email.evidence,
      artifactId,
    }),
    metric({
      metricId: "email.cross_client_compat",
      dimension: "quality.ux",
      value: 0,
      status: "UNVERIFIED",
      method: "not_automated",
      measurementStatus: "NOT_AUTOMATED",
      evidence: Object.freeze(["cross-client email rendering not tested — NOT_AUTOMATED"]),
      artifactId,
    }),
  ];

  return Object.freeze({
    metrics: Object.freeze([...emailMetrics, ...htmlResult.metrics]),
    htmlContent: html,
  });
}

/** Video / animation — container metadata from bytes. */
export function evaluateVideoAdapter(artifact: HydratedArtifact): ModalityAdapterResult {
  const video = analyzeVideoBytes(artifact.bytes, artifact.mimeType);
  const metrics: ObjectiveMetric[] = [
    metric({
      metricId: "video.readable",
      dimension: "hard.deliverable_format_valid",
      value: video.isReadable,
      status: video.isReadable ? "PASS" : "FAIL",
      method: "artifact_inspection",
      measurementStatus: "MEASURED",
      evidence: video.evidence,
      artifactId: artifact.artifactId,
    }),
    metric({
      metricId: "video.byte_size",
      dimension: "hard.deliverable_format_valid",
      value: video.byteSize,
      unit: "bytes",
      threshold: 1000,
      status: video.byteSize > 1000 ? "PASS" : "UNVERIFIED",
      method: "artifact_inspection",
      measurementStatus: "MEASURED",
      evidence: Object.freeze([`video artifact bytes=${video.byteSize}`]),
      artifactId: artifact.artifactId,
    }),
    metric({
      metricId: "video.container_format",
      dimension: "hard.deliverable_format_valid",
      value: video.containerFormat ?? "unknown",
      status: video.containerFormat === "mp4" ? "PASS" : "UNVERIFIED",
      method: "artifact_inspection",
      measurementStatus: video.containerFormat ? "MEASURED" : "NOT_AUTOMATED",
      evidence: video.evidence,
      artifactId: artifact.artifactId,
    }),
  ];

  if (video.durationSec != null) {
    metrics.push(
      metric({
        metricId: "video.duration_sec",
        dimension: "quality.content",
        value: Math.round(video.durationSec * 100) / 100,
        unit: "seconds",
        threshold: 0.1,
        status: video.durationSec > 0 ? "PASS" : "UNVERIFIED",
        method: "container_metadata",
        measurementStatus: "MEASURED",
        evidence: video.evidence,
        artifactId: artifact.artifactId,
      }),
    );
  }
  if (video.width != null && video.height != null) {
    metrics.push(
      metric({
        metricId: "video.dimensions",
        dimension: "hard.deliverable_format_valid",
        value: `${video.width}x${video.height}`,
        status: "PASS",
        method: "container_metadata",
        measurementStatus: "MEASURED",
        evidence: video.evidence,
        artifactId: artifact.artifactId,
      }),
    );
  }
  if (video.hasVideoStream != null) {
    metrics.push(
      metric({
        metricId: "video.stream_video",
        dimension: "hard.deliverable_format_valid",
        value: video.hasVideoStream,
        status: video.hasVideoStream ? "PASS" : "UNVERIFIED",
        method: "container_metadata",
        measurementStatus: "MEASURED",
        evidence: video.evidence,
        artifactId: artifact.artifactId,
      }),
    );
  }
  if (video.hasAudioStream != null) {
    metrics.push(
      metric({
        metricId: "video.stream_audio",
        dimension: "hard.deliverable_format_valid",
        value: video.hasAudioStream,
        status: "PASS",
        method: "container_metadata",
        measurementStatus: "MEASURED",
        evidence: video.evidence,
        artifactId: artifact.artifactId,
      }),
    );
  }

  metrics.push(
    metric({
      metricId: "video.quality_score",
      dimension: "quality.visual_quality",
      value: 0,
      status: "UNVERIFIED",
      method: "not_automated",
      measurementStatus: "NOT_AUTOMATED",
      evidence: Object.freeze(["subjective video quality requires dedicated quality engine — NOT_AUTOMATED"]),
      artifactId: artifact.artifactId,
    }),
  );

  return Object.freeze({ metrics: Object.freeze(metrics) });
}

export async function selectAdapterForContext(
  ctx: EvaluationContext,
  hydrated: readonly HydratedArtifact[],
): Promise<ModalityAdapterResult> {
  const kind = (ctx.outputKind ?? "dynamic").toLowerCase();

  if (TEXT_KINDS.has(kind) && hydrated.length === 0) {
    return evaluateTextAdapter(ctx);
  }

  const htmlArtifact = hydrated.find((a) => a.kind === "html");
  const htmlContent =
    htmlArtifact?.textContent ??
    (ctx.preview && /<html[\s>]/i.test(ctx.preview) ? ctx.preview : undefined);

  if (htmlContent && EMAIL_KINDS.has(kind)) {
    return evaluateEmailAdapter(ctx, htmlContent, htmlArtifact?.artifactId);
  }
  if (htmlContent) {
    return evaluateHtmlAdapter(ctx, htmlContent, htmlArtifact?.artifactId);
  }

  const imageArtifact = hydrated.find((a) => a.kind === "image");
  if (imageArtifact || VISUAL_KINDS.has(kind)) {
    if (imageArtifact) return evaluateImageAdapter(ctx, imageArtifact);
  }

  if (PRESENTATION_KINDS.has(kind)) {
    const presArtifacts = hydrated.filter((a) => a.kind === "pdf" || a.kind === "pptx");
    if (presArtifacts.length > 0) {
      return evaluatePresentationAdapter(ctx, presArtifacts);
    }
  }

  const pdfArtifact = hydrated.find((a) => a.kind === "pdf");
  const docxArtifact = hydrated.find((a) => a.kind === "docx");
  if (DOCUMENT_KINDS.has(kind) && (pdfArtifact || docxArtifact)) {
    return evaluateDocumentAdapter(ctx, hydrated.filter((a) => a.kind === "pdf" || a.kind === "docx"));
  }

  const videoArtifact = hydrated.find(
    (a) => a.kind === "other" && a.mimeType.includes("video"),
  );
  if (videoArtifact || VIDEO_KINDS.has(kind)) {
    if (videoArtifact) return evaluateVideoAdapter(videoArtifact);
  }

  if (ctx.preview?.trim()) {
    return evaluateTextAdapter(ctx);
  }

  return Object.freeze({ metrics: Object.freeze([]) });
}

const TEXT_KINDS = new Set(["text", "dynamic", "human_form"]);
const EMAIL_KINDS = new Set(["email"]);
const VISUAL_KINDS = new Set(["image", "image_mockup", "image_3d_mockup", "edited_image"]);
const DOCUMENT_KINDS = new Set(["document"]);
const PRESENTATION_KINDS = new Set(["presentation"]);
const VIDEO_KINDS = new Set(["video", "animation"]);
