/**
 * Artifact inspection validators — inspect actual produced artifacts.
 */

import type { ContractRequirement } from "../../../contracts/output-contracts/evaluation-methods";
import type { RequirementValidationResult } from "../validation-result";
import type { ValidationArtifactContext } from "../artifact-context";
import {
  hasMediaArtifact,
  previewIsEmpty,
  structuredArrayLength,
  structuredHasKey,
} from "../artifact-context";
import { OUTPUT_VALIDATION_VERSION } from "../validation-result";

const VALIDATOR_VERSION = `artifact_inspection.${OUTPUT_VALIDATION_VERSION}`;

function result(
  req: ContractRequirement,
  status: RequirementValidationResult["status"],
  actualValue: string | undefined,
  evidence: string[],
  repairGuidance?: string,
  failureCategory?: RequirementValidationResult["failureCategory"],
): RequirementValidationResult {
  return Object.freeze({
    requirementId: req.id,
    category: req.category,
    description: req.description,
    evaluationMethod: req.evaluation.method,
    status,
    actualValue,
    expectedValue: req.evaluation.expectedResult,
    severity: req.evaluation.severity,
    blocksCompletion: req.evaluation.blocksCompletion,
    optional: req.optional,
    evidence: Object.freeze(evidence),
    validatorVersion: VALIDATOR_VERSION,
    repairGuidance,
    failureCategory,
  });
}

export function validateArtifactInspection(
  req: ContractRequirement,
  ctx: ValidationArtifactContext,
  outputKind?: string,
): RequirementValidationResult {
  const kind = (outputKind ?? ctx.outputKind ?? "").toLowerCase();
  const expected = req.evaluation.expectedResult.toLowerCase();

  // Image artifact checks
  if (
    expected.includes("image/png") ||
    expected.includes("image/jpeg") ||
    expected.includes("image/") ||
    req.id.includes("image_artifact") ||
    req.id === "hard.image.artifact"
  ) {
    const imageRef = ctx.artifactRefs.find(
      (a) =>
        a.mimeType?.startsWith("image/") ||
        a.kind === "image" ||
        a.kind === "media",
    );
    if (imageRef || ctx.mediaArtifactIds.length > 0) {
      const mime = imageRef?.mimeType ?? "media artifact present";
      return result(req, "PASS", mime, [
        `media artifact count: ${ctx.mediaArtifactIds.length || 1}`,
        imageRef ? `ref: ${imageRef.artifactId}` : "mediaArtifactIds present",
      ]);
    }
    if (kind === "image" || kind === "image_mockup" || kind === "image_3d_mockup") {
      return result(
        req,
        "FAIL",
        "no image artifact",
        ["no mediaArtifactIds or image artifact ref"],
        "Generate and attach raster image artifact",
        "missing_requirement",
      );
    }
    return result(req, "UNVERIFIED", undefined, [
      "image artifact not inspectable in current context",
    ]);
  }

  // Video artifact checks
  if (
    expected.includes("video/mp4") ||
    req.id.includes("video_artifact") ||
    req.id === "hard.video.artifact"
  ) {
    const videoRef = ctx.artifactRefs.find(
      (a) => a.mimeType?.startsWith("video/") || a.kind === "video",
    );
    if (videoRef || (kind === "video" && ctx.mediaArtifactIds.length > 0)) {
      return result(req, "PASS", videoRef?.mimeType ?? "video/mp4", [
        "video media artifact present",
      ]);
    }
    if (kind === "video" || kind === "animation") {
      return result(
        req,
        "FAIL",
        "no video artifact",
        ["no video artifact detected"],
        "Produce mp4 video artifact",
        "missing_requirement",
      );
    }
    return result(req, "UNVERIFIED", undefined, ["video artifact not inspectable"]);
  }

  // Website routes / pages
  if (
    req.id.includes("routes") ||
    req.id.includes("pages") ||
    expected.includes("route")
  ) {
    const routesLen =
      structuredArrayLength(ctx, "routes") ??
      structuredArrayLength(ctx, "pages") ??
      structuredArrayLength(ctx, "websitePages");
    if (routesLen !== undefined && routesLen > 0) {
      return result(req, "PASS", `${routesLen} routes/pages`, [
        `structured data contains ${routesLen} routes/pages`,
      ]);
    }
    if (structuredHasKey(ctx, "routes", "pages", "websitePages", "siteMap")) {
      return result(req, "PASS", "routes present", ["route/page keys in structured output"]);
    }
    if (kind === "deferred_website" && !previewIsEmpty(ctx)) {
      return result(req, "UNVERIFIED", undefined, [
        "website routes not found in structured output — requires WebProject schema inspection",
      ]);
    }
  }

  // Presentation slides
  if (req.id.includes("slides") || req.id.includes("presentation")) {
    const decks =
      structuredArrayLength(ctx, "decks") ??
      structuredArrayLength(ctx, "routes") ??
      structuredArrayLength(ctx, "slides");
    if (decks !== undefined && decks > 0) {
      return result(req, "PASS", `${decks} slides/decks`, ["presentation structure found"]);
    }
    if (structuredHasKey(ctx, "PresentationRoutes", "decks", "slides")) {
      return result(req, "PASS", "presentation structure", ["presentation keys present"]);
    }
  }

  // Document sections
  if (req.id.includes("sections") || req.id.includes("document")) {
    const sections = structuredArrayLength(ctx, "sections");
    if (sections !== undefined && sections > 0) {
      return result(req, "PASS", `${sections} sections`, ["document sections found"]);
    }
    if (structuredHasKey(ctx, "sections", "DocumentPlan")) {
      return result(req, "PASS", "document structure", ["document plan keys present"]);
    }
  }

  // Email HTML
  if (req.id.includes("email") && expected.includes("html")) {
    if (/<html|<body|<table/i.test(ctx.preview)) {
      return result(req, "PASS", "html email", ["HTML email content detected"]);
    }
    if (structuredHasKey(ctx, "html", "bodyHtml", "EmailPlan")) {
      return result(req, "PASS", "email plan", ["email structured output present"]);
    }
  }

  // CTA / export format
  if (req.id.includes("cta") || expected.includes("cta")) {
    if (/\b(cta|call to action|shop now|buy now|learn more|get started|sign up)\b/i.test(ctx.preview)) {
      return result(req, "PASS", "CTA found", ["CTA signal in output"]);
    }
    return result(req, "UNVERIFIED", undefined, ["CTA requires semantic/visual evaluation"]);
  }

  // Generic deliverable presence
  if (req.category === "deliverable" || req.category === "delivery") {
    if (!previewIsEmpty(ctx) || hasMediaArtifact(ctx)) {
      return result(req, "PASS", "artifact present", ["preview or media artifact exists"]);
    }
    return result(req, "FAIL", "missing", ["no artifact detected"], "Produce required deliverable");
  }

  return result(req, "UNVERIFIED", undefined, [
    `artifact inspection not specialized for ${req.id}`,
  ]);
}
