/**
 * Visual evaluator — inspects actual visual artifacts, not model claims.
 */

import type { ContractRequirement } from "../../../contracts/output-contracts/evaluation-methods";
import type { QualityDimension } from "../../../contracts/output-contracts/evaluation-methods";
import type { RequirementValidationResult } from "../validation-result";
import type { QualityDimensionValidationResult } from "../validation-result";
import type { ValidationArtifactContext } from "../artifact-context";
import { hasMediaArtifact } from "../artifact-context";
import { OUTPUT_VALIDATION_VERSION } from "../validation-result";
import { evaluateArtifactBackedVisualQualityDimension } from "./artifact-quality-evaluator";

const EVALUATOR_VERSION = `visual.${OUTPUT_VALIDATION_VERSION}`;

function reqResult(
  req: ContractRequirement,
  status: RequirementValidationResult["status"],
  evidence: string[],
): RequirementValidationResult {
  return Object.freeze({
    requirementId: req.id,
    category: req.category,
    description: req.description,
    evaluationMethod: req.evaluation.method,
    status,
    expectedValue: req.evaluation.expectedResult,
    severity: req.evaluation.severity,
    blocksCompletion: req.evaluation.blocksCompletion,
    optional: req.optional,
    evidence: Object.freeze(evidence),
    validatorVersion: EVALUATOR_VERSION,
  });
}

export function validateVisualRequirement(
  req: ContractRequirement,
  ctx: ValidationArtifactContext,
): RequirementValidationResult {
  if (!hasMediaArtifact(ctx)) {
    if (req.evaluation.blocksCompletion) {
      return reqResult(req, "FAIL", ["no visual artifact to inspect"]);
    }
    return reqResult(req, "UNVERIFIED", ["no visual artifact available"]);
  }

  // Deterministic kind-level check: production image kind with artifact
  if (
    req.id === "hard.image.production_not_mockup" &&
    ctx.outputKind === "image"
  ) {
    return reqResult(req, "PASS", [
      "output kind is production image (not mockup kind) with artifact present",
    ]);
  }

  const imageRef = ctx.artifactRefs.find((a) => a.mimeType?.startsWith("image/"));
  if (imageRef?.width && imageRef?.height) {
    return reqResult(req, "UNVERIFIED", [
      `image dimensions ${imageRef.width}x${imageRef.height} — visual quality requires visual judge`,
    ]);
  }

  if (
    req.id.includes("scalable") ||
    req.id.includes("realistic") ||
    req.id.includes("3d") ||
    req.id.includes("mockup.realistic")
  ) {
    return reqResult(req, "NOT_AUTOMATED", [
      "visual quality evaluation requires visual judge — explicit NOT_AUTOMATED",
    ]);
  }

  return reqResult(req, "UNVERIFIED", [
    "visual artifact present — visual quality evaluation requires visual judge (not model self-claim)",
  ]);
}

export function evaluateVisualQualityDimension(
  dim: QualityDimension,
  ctx: ValidationArtifactContext,
): QualityDimensionValidationResult {
  const artifactBacked = evaluateArtifactBackedVisualQualityDimension(dim, ctx);
  if (artifactBacked) {
    return artifactBacked;
  }

  const weight = dim.weight ?? 1.0;
  let status: QualityDimensionValidationResult["status"] = "UNVERIFIED";
  const evidence: string[] = [];
  const score = 0;

  if (hasMediaArtifact(ctx)) {
    evidence.push("media artifact present — visual judge required for scoring");
    status = "UNVERIFIED";
  } else if (ctx.preview.trim().length > 100) {
    evidence.push("text preview only — visual dimension not applicable");
    status = "NOT_AUTOMATED";
  } else {
    evidence.push("no visual artifact");
    status = "UNVERIFIED";
  }

  return Object.freeze({
    dimensionId: dim.id,
    label: dim.label,
    score,
    threshold: dim.threshold,
    weight,
    weightedContribution: 0,
    status,
    evidence: Object.freeze(evidence),
    evaluatorVersion: EVALUATOR_VERSION,
    evaluationMethod: dim.evaluationMethod,
  });
}
