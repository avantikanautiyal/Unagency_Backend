/**
 * Track B3 — Creative Score evaluator (10 dimensions → /100 release gate).
 */

import type {
  EvaluateOutputInput,
  EvaluationFinding,
  EvaluationResult,
  IEvaluator,
} from "../contracts/evaluation-result";
import { OS_EVALUATION_VERSION } from "../contracts/evaluation-result";
import {
  CREATIVE_SCORE_DIMENSION_LABELS,
  CREATIVE_SCORE_RELEASE_GATE,
  CREATIVE_SCORE_DIMENSIONS,
  type CreativeScoreDimension,
} from "../creative-score/creative-score-dimensions";
import { judgeCreativeScore } from "../creative-score/creative-score-judge";
import {
  creativeQaObservesOnly,
  resolveCreativeQaRollout,
} from "../creative-score/creative-qa-rollout";

export const CREATIVE_SCORE_EVALUATOR_ID = "creative_score" as const;
export const CREATIVE_SCORE_EVALUATOR_VERSION = "1.0.0" as const;

export class CreativeScoreEvaluator implements IEvaluator {
  readonly evaluatorId = CREATIVE_SCORE_EVALUATOR_ID;
  readonly category = "custom" as const;
  readonly evaluatorVersion = CREATIVE_SCORE_EVALUATOR_VERSION;

  evaluate(input: EvaluateOutputInput): EvaluationResult {
    const nowIso = input.nowIso ?? (() => new Date().toISOString());
    const createId = input.createId ?? ((p: string) => `${p}_${Date.now()}`);
    const rollout = resolveCreativeQaRollout();

    if (rollout === "off") {
      return this.skippedResult(input, nowIso, createId);
    }

    const judged = judgeCreativeScore({
      preview: input.preview,
      objective: input.objective,
      briefObjective: input.briefObjective,
      brandTone: input.brandTone,
      brandVoice: input.brandVoice,
      brandAvoidTerms: input.brandAvoidTerms,
      brandPreferredTerms: input.brandPreferredTerms,
      service: input.service,
      territory: input.territory,
      capabilityId: input.capabilityId,
      isImageCapability: input.isImageCapability,
    });

    const findings: EvaluationFinding[] = [];
    for (const dim of judged.weakDimensions) {
      findings.push({
        code: `CREATIVE_WEAK_${dim.toUpperCase()}`,
        message: `Rework ${CREATIVE_SCORE_DIMENSION_LABELS[dim]} (${judged.dimensions[dim]}/10)`,
        severity: "warning",
        field: dim,
      });
    }

    if (!judged.releaseAllowed) {
      findings.push({
        code: "CREATIVE_SCORE_BELOW_GATE",
        message: `Creative score ${judged.totalScore}/100 below release gate (${CREATIVE_SCORE_RELEASE_GATE})`,
        severity: "error",
      });
    }

    const shadow = creativeQaObservesOnly(rollout);
    let outcome: EvaluationResult["outcome"] = "PASS";
    if (!judged.releaseAllowed && !shadow) {
      outcome = "BLOCKED";
    } else if (!judged.releaseAllowed && shadow) {
      outcome = "PASS_WITH_WARNINGS";
    } else if (judged.weakDimensions.length > 0) {
      outcome = "PASS_WITH_WARNINGS";
    }

    const normalizedOverall = judged.totalScore / 100;

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
        creativeScoreTotal: judged.totalScore,
        creativeDimensionScores: { ...judged.dimensions },
        overallScore: normalizedOverall,
        qualityScore: normalizedOverall,
        riskScore: judged.releaseAllowed ? 0.15 : 0.85,
      },
      findings,
      severity: outcome === "BLOCKED" ? "critical" : findings.length ? "warning" : "info",
      confidence: 0.92,
      provenance: CREATIVE_SCORE_DIMENSIONS.map((dim: CreativeScoreDimension) => ({
        field: dim,
        value: String(judged.dimensions[dim]),
        source: "OUTPUT" as const,
      })),
    };
  }

  private skippedResult(
    input: EvaluateOutputInput,
    nowIso: () => string,
    createId: (prefix: string) => string
  ): EvaluationResult {
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
      outcome: "PASS",
      scores: {},
      findings: [
        {
          code: "CREATIVE_QA_OFF",
          message: "Creative QA rollout off — gate skipped",
          severity: "info",
        },
      ],
      severity: "info",
      confidence: 1,
      provenance: [],
    };
  }
}
