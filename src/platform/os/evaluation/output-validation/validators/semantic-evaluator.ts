/**
 * Semantic evaluator — independent evaluation boundary (not model self-claims).
 * Uses deterministic heuristics where possible; marks UNVERIFIED when insufficient evidence.
 */

import type { ContractRequirement } from "../../../contracts/output-contracts/evaluation-methods";
import type { QualityDimension } from "../../../contracts/output-contracts/evaluation-methods";
import type { RequirementValidationResult } from "../validation-result";
import type { QualityDimensionValidationResult } from "../validation-result";
import type { ValidationArtifactContext } from "../artifact-context";
import { hasPlaceholderContent, previewIsEmpty } from "../artifact-context";
import { OUTPUT_VALIDATION_VERSION } from "../validation-result";

const EVALUATOR_VERSION = `semantic.${OUTPUT_VALIDATION_VERSION}`;

function reqResult(
  req: ContractRequirement,
  status: RequirementValidationResult["status"],
  score: number | undefined,
  actualValue: string | undefined,
  evidence: string[],
): RequirementValidationResult {
  return Object.freeze({
    requirementId: req.id,
    category: req.category,
    description: req.description,
    evaluationMethod: req.evaluation.method,
    status,
    actualValue,
    expectedValue: req.evaluation.expectedResult,
    score,
    threshold: req.evaluation.threshold,
    severity: req.evaluation.severity,
    blocksCompletion: req.evaluation.blocksCompletion,
    optional: req.optional,
    evidence: Object.freeze(evidence),
    validatorVersion: EVALUATOR_VERSION,
    failureCategory: status === "FAIL" ? "user_requirement_violation" : undefined,
  });
}

/** Brief token overlap heuristic — deterministic proxy, not LLM self-evaluation. */
export function scoreBriefRelevance(
  preview: string,
  briefObjective?: string,
): { score: number; evidence: string[] } {
  if (!briefObjective?.trim() || previewIsEmpty({ preview } as ValidationArtifactContext)) {
    return { score: 0, evidence: ["no brief or empty output"] };
  }
  const tokens = briefObjective
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 3)
    .slice(0, 12);
  if (!tokens.length) {
    return { score: 50, evidence: ["brief too short for token analysis"] };
  }
  const lower = preview.toLowerCase();
  const hits = tokens.filter((t) => lower.includes(t)).length;
  const score = Math.round((hits / tokens.length) * 100);
  return {
    score,
    evidence: [`brief token overlap: ${hits}/${tokens.length} (${score}%)`],
  };
}

export function validateSemanticRequirement(
  req: ContractRequirement,
  ctx: ValidationArtifactContext,
  briefObjective?: string,
): RequirementValidationResult {
  if (previewIsEmpty(ctx) && !ctx.mediaArtifactIds.length) {
    return reqResult(req, "FAIL", 0, "empty", ["cannot evaluate semantics on empty output"]);
  }

  if (hasPlaceholderContent(ctx)) {
    return reqResult(req, "FAIL", 20, "placeholder", ["placeholder content detected"]);
  }

  const { score, evidence } = scoreBriefRelevance(ctx.preview, briefObjective);
  const threshold = req.evaluation.threshold ?? 70;

  if (req.id.includes("brief") || req.category === "user_task" || req.category === "content") {
    if (score >= threshold) {
      return reqResult(req, "PASS", score, `${score}%`, evidence);
    }
    if (score > 0) {
      return reqResult(req, "FAIL", score, `${score}%`, [
        ...evidence,
        `below threshold ${threshold}`,
      ]);
    }
  }

  // Semantic requirements without inspectable text evidence
  if (ctx.mediaArtifactIds.length > 0 && previewIsEmpty(ctx)) {
    return reqResult(req, "UNVERIFIED", undefined, undefined, [
      "visual/media output — semantic evaluation requires visual evaluator or human review",
    ]);
  }

  return reqResult(req, "UNVERIFIED", undefined, undefined, [
    "semantic evaluation insufficient evidence — not treated as pass",
  ]);
}

export function evaluateSemanticQualityDimension(
  dim: QualityDimension,
  ctx: ValidationArtifactContext,
  briefObjective?: string,
): QualityDimensionValidationResult {
  const weight = dim.weight ?? 1.0;
  let score = 0;
  let status: QualityDimensionValidationResult["status"] = "UNVERIFIED";
  const evidence: string[] = [];

  if (dim.id.includes("brief") || dim.id.includes("relevance") || dim.id.includes("adherence")) {
    const rel = scoreBriefRelevance(ctx.preview, briefObjective);
    score = rel.score;
    evidence.push(...rel.evidence);
    status = score >= dim.threshold ? "PASS" : score > 0 ? "FAIL" : "UNVERIFIED";
  } else if (!previewIsEmpty(ctx)) {
    // Heuristic completeness proxy — not fake LLM score
    const len = ctx.preview.length;
    score = Math.min(100, Math.round(Math.log10(len + 1) * 35));
    evidence.push(`content length heuristic: ${len} chars → ${score}`);
    status = score >= dim.threshold ? "PASS" : "FAIL";
  } else if (ctx.mediaArtifactIds.length > 0) {
    status = "UNVERIFIED";
    evidence.push("media artifact present — dimension requires visual evaluator");
  }

  return Object.freeze({
    dimensionId: dim.id,
    label: dim.label,
    score,
    threshold: dim.threshold,
    weight,
    weightedContribution: score * weight,
    status,
    evidence: Object.freeze(evidence),
    evaluatorVersion: EVALUATOR_VERSION,
    evaluationMethod: dim.evaluationMethod,
  });
}
