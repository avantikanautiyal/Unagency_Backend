/**
 * Quality evaluator — completeness / relevance / clarity heuristics.
 */

import type {
  EvaluateOutputInput,
  EvaluationFinding,
  EvaluationResult,
  IEvaluator,
} from "../contracts/evaluation-result";
import { OS_EVALUATION_VERSION } from "../contracts/evaluation-result";

export const QUALITY_EVALUATOR_ID = "quality" as const;
export const QUALITY_EVALUATOR_VERSION = "1.0.0" as const;

export class QualityEvaluator implements IEvaluator {
  readonly evaluatorId = QUALITY_EVALUATOR_ID;
  readonly category = "quality" as const;
  readonly evaluatorVersion = QUALITY_EVALUATOR_VERSION;

  evaluate(input: EvaluateOutputInput): EvaluationResult {
    const nowIso = input.nowIso ?? (() => new Date().toISOString());
    const createId = input.createId ?? ((p: string) => `${p}_${Date.now()}`);
    const findings: EvaluationFinding[] = [];
    const preview = (input.preview ?? "").trim();
    let quality = 1;

    if (preview.length < 8) {
      findings.push({
        code: "QUALITY_TOO_SHORT",
        message: "Output is too short to be useful",
        severity: "error",
      });
      quality = 0.2;
    } else if (preview.length < 24) {
      findings.push({
        code: "QUALITY_BRIEF",
        message: "Output is very brief",
        severity: "warning",
      });
      quality = Math.min(quality, 0.7);
    }

    const objective = (input.objective ?? input.briefObjective ?? "").toLowerCase();
    if (objective) {
      const tokens = objective
        .split(/\W+/)
        .filter((t) => t.length > 3)
        .slice(0, 8);
      const hits = tokens.filter((t) => preview.toLowerCase().includes(t)).length;
      if (tokens.length >= 2 && hits === 0) {
        findings.push({
          code: "QUALITY_LOW_RELEVANCE",
          message: "Output shows weak overlap with task/brief objective",
          severity: "warning",
        });
        quality = Math.min(quality, 0.55);
      }
    }

    if (/lorem ipsum|placeholder text|todo:|fixme/i.test(preview)) {
      findings.push({
        code: "QUALITY_PLACEHOLDER",
        message: "Output contains placeholder content",
        severity: "error",
      });
      quality = Math.min(quality, 0.3);
    }

    const errors = findings.filter((f) => f.severity === "error");
    const warnings = findings.filter((f) => f.severity === "warning");
    const outcome =
      quality < 0.45 || errors.length > 0
        ? quality < 0.35
          ? ("RETRY_REQUIRED" as const)
          : ("HUMAN_REVIEW_REQUIRED" as const)
        : warnings.length > 0
          ? ("PASS_WITH_WARNINGS" as const)
          : ("PASS" as const);

    // Elevated risk signal when borderline
    const riskScore =
      outcome === "HUMAN_REVIEW_REQUIRED"
        ? 0.65
        : outcome === "RETRY_REQUIRED"
          ? 0.5
          : warnings.length
            ? 0.3
            : 0.1;

    return {
      evaluationId: createId("eval"),
      version: OS_EVALUATION_VERSION,
      organizationId: input.organizationId,
      executionId: input.executionId,
      planId: input.planId,
      planVersion: input.planVersion,
      taskId: input.taskId,
      outputRefId: input.outputRefId,
      evaluatorId: this.evaluatorId,
      evaluatorType: this.category,
      evaluatorVersion: this.evaluatorVersion,
      evaluatedAt: nowIso(),
      outcome,
      scores: {
        qualityScore: quality,
        overallScore: quality,
        riskScore,
      },
      findings,
      severity: errors.length ? "error" : warnings.length ? "warning" : "info",
      confidence: 0.75,
      provenance: [
        {
          field: "objective",
          value: (input.objective ?? "").slice(0, 120),
          source: "BRIEF",
        },
      ],
    };
  }
}
