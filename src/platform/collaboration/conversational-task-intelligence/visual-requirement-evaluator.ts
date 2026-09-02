/**
 * P4.9 — Visual negative-constraint evaluation extension (existing Evaluation Plane).
 * MODEL_JUDGED when a registered judge is available; honest NOT_AUTOMATED otherwise.
 */

import type { NegativeConstraintSpec } from "./execution-specification";
import { EXECUTION_RESOLUTION_PLANE_VERSION } from "./execution-specification";

export type VisualRequirementEvaluationMode =
  | "MEASURED"
  | "HEURISTIC"
  | "MODEL_JUDGED"
  | "NOT_AUTOMATED";

export type VisualRequirementComplianceStatus =
  | "COMPLIANT"
  | "VIOLATED"
  | "NOT_EVALUATED";

export type VisualRequirementEvaluatorProvenance = Readonly<{
  readonly evaluatorId: string;
  readonly evaluatorVersion: string;
  readonly evaluationPlaneVersion: string;
  readonly modelId?: string;
  readonly providerId?: string;
}>;

export type VisualRequirementEvaluationResult = Readonly<{
  readonly requirementId: string;
  readonly requirement: string;
  readonly normalizedConcept: string;
  readonly status: VisualRequirementComplianceStatus;
  readonly evaluationMode: VisualRequirementEvaluationMode;
  readonly evaluatorProvenance?: VisualRequirementEvaluatorProvenance;
  readonly evidence: readonly string[];
}>;

export type VisualRequirementJudgeInput = Readonly<{
  readonly artifactBytes?: Buffer;
  readonly mimeType?: string;
  readonly normalizedConcept: string;
  readonly subject: string;
  readonly requirementContext?: string;
}>;

export type VisualRequirementJudge = (
  input: VisualRequirementJudgeInput,
) => Promise<VisualRequirementEvaluationResult | undefined>;

const VISUAL_REQUIREMENT_EVALUATOR_VERSION = "visual-requirement.p4.9.0";

let registeredJudge: VisualRequirementJudge | undefined;

export function registerVisualRequirementJudge(judge: VisualRequirementJudge): void {
  registeredJudge = judge;
}

export function resetVisualRequirementJudgeForTests(): void {
  registeredJudge = undefined;
}

export function classifyVisualConstraintEvaluationMode(
  constraint: NegativeConstraintSpec,
  hasImageArtifact: boolean,
): VisualRequirementEvaluationMode {
  const concept = constraint.normalizedConcept;
  if (!hasImageArtifact) return "NOT_AUTOMATED";
  if (concept.includes("cta")) return "HEURISTIC";
  if (/\b(green|red|blue|gradient|serif|rounded)\b/.test(concept)) {
    return "HEURISTIC";
  }
  if (concept.includes("leaf") || concept.includes("recycling")) {
    return registeredJudge ? "MODEL_JUDGED" : "NOT_AUTOMATED";
  }
  return registeredJudge ? "MODEL_JUDGED" : "NOT_AUTOMATED";
}

export async function evaluateVisualNegativeConstraint(input: {
  readonly constraint: NegativeConstraintSpec;
  readonly previewText?: string;
  readonly artifactBytes?: Buffer;
  readonly mimeType?: string;
  readonly requirementContext?: string;
}): Promise<VisualRequirementEvaluationResult> {
  const requirementId = `negative.${input.constraint.normalizedConcept}`;
  const hasImageArtifact = Boolean(input.artifactBytes?.length);
  const mode = classifyVisualConstraintEvaluationMode(
    input.constraint,
    hasImageArtifact,
  );

  if (mode === "HEURISTIC" && input.previewText) {
    const previewLower = input.previewText.toLowerCase();
    const concept = input.constraint.normalizedConcept;
    if (concept.includes("green")) {
      const violated = /\bgreen\b/i.test(previewLower);
      return Object.freeze({
        requirementId,
        requirement: input.constraint.subject,
        normalizedConcept: concept,
        status: violated ? "VIOLATED" : "COMPLIANT",
        evaluationMode: "HEURISTIC",
        evidence: Object.freeze([
          violated
            ? "NEGATIVE_REQUIREMENT_FAILURE: green detected in output metadata"
            : "No green detected in available output metadata",
        ]),
      });
    }
    if (concept.includes("leaf")) {
      const violated = /\bleaf\b|\bleaves\b|\bfoliage\b/i.test(previewLower);
      return Object.freeze({
        requirementId,
        requirement: input.constraint.subject,
        normalizedConcept: concept,
        status: violated ? "VIOLATED" : "COMPLIANT",
        evaluationMode: "HEURISTIC",
        evidence: Object.freeze([
          violated
            ? "HARD_CONSTRAINT_VIOLATION: leaf reference detected in output metadata"
            : "No leaf reference detected in available output metadata",
        ]),
      });
    }
  }

  if (mode === "MODEL_JUDGED" && registeredJudge && hasImageArtifact) {
    const judged = await registeredJudge({
      artifactBytes: input.artifactBytes,
      mimeType: input.mimeType,
      normalizedConcept: input.constraint.normalizedConcept,
      subject: input.constraint.subject,
      requirementContext: input.requirementContext,
    });
    if (judged) {
      return Object.freeze({
        ...judged,
        evaluatorProvenance: Object.freeze({
          evaluatorId: judged.evaluatorProvenance?.evaluatorId ?? "visual-requirement-judge",
          evaluatorVersion:
            judged.evaluatorProvenance?.evaluatorVersion ??
            VISUAL_REQUIREMENT_EVALUATOR_VERSION,
          evaluationPlaneVersion: EXECUTION_RESOLUTION_PLANE_VERSION,
          modelId: judged.evaluatorProvenance?.modelId,
          providerId: judged.evaluatorProvenance?.providerId,
        }),
      });
    }
  }

  return Object.freeze({
    requirementId,
    requirement: input.constraint.subject,
    normalizedConcept: input.constraint.normalizedConcept,
    status: "NOT_EVALUATED",
    evaluationMode: "NOT_AUTOMATED",
    evidence: Object.freeze([
      hasImageArtifact
        ? `Visual constraint '${input.constraint.subject}' requires model-judged evaluation; no independent judge configured`
        : `No image artifact available to evaluate: ${input.constraint.subject}`,
    ]),
  });
}

export async function evaluateVisualNegativeConstraints(input: {
  readonly constraints: readonly NegativeConstraintSpec[];
  readonly previewText?: string;
  readonly artifactBytes?: Buffer;
  readonly mimeType?: string;
  readonly requirementContext?: string;
}): Promise<readonly VisualRequirementEvaluationResult[]> {
  const hard = input.constraints.filter((c) => c.enforcement === "HARD_CONSTRAINT");
  const results: VisualRequirementEvaluationResult[] = [];
  for (const constraint of hard) {
    results.push(
      await evaluateVisualNegativeConstraint({
        constraint,
        previewText: input.previewText,
        artifactBytes: input.artifactBytes,
        mimeType: input.mimeType,
        requirementContext: input.requirementContext,
      }),
    );
  }
  return Object.freeze(results);
}

export function mapVisualRequirementToComplianceStatus(
  result: VisualRequirementEvaluationResult,
): "PASS" | "FAIL" | "NOT_AUTOMATED" {
  if (result.status === "COMPLIANT") return "PASS";
  if (result.status === "VIOLATED") return "FAIL";
  return "NOT_AUTOMATED";
}

export { VISUAL_REQUIREMENT_EVALUATOR_VERSION };
