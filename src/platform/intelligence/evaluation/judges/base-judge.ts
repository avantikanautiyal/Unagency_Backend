/**
 * Shared judge utilities for placeholder evaluations.
 */

import { randomUUID } from "crypto";
import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type {
  EvaluationCriterion,
  EvaluationFinding,
  JudgeKind,
  JudgeResult,
  JudgeScore,
} from "../contracts/evaluation-models";
import type { IJudge, JudgeContext } from "../interfaces/evaluation-ports";

export function clampScore(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function normalizeScore(raw: number, max = 1): number {
  if (max <= 0) return 0;
  return clampScore(raw / max);
}

export function buildJudgeScore(
  criterion: EvaluationCriterion,
  rawScore: number,
  notes?: string
): JudgeScore {
  const normalizedScore = clampScore(rawScore);
  const weightedScore = normalizedScore * criterion.weight;
  return {
    criterionId: criterion.id,
    criterionName: criterion.name,
    rawScore,
    normalizedScore,
    weight: criterion.weight,
    weightedScore,
    threshold: criterion.threshold,
    passed: normalizedScore >= criterion.threshold,
    notes,
  };
}

export function buildFinding(
  criterionId: string,
  severity: EvaluationFinding["severity"],
  message: string,
  path?: string
): EvaluationFinding {
  return {
    id: `finding_${randomUUID()}`,
    criterionId,
    severity,
    message,
    path,
  };
}

export function aggregateJudgeScores(scores: readonly JudgeScore[]): number {
  if (!scores.length) return 0;
  const totalWeight = scores.reduce((sum, s) => sum + s.weight, 0);
  if (totalWeight <= 0) return 0;
  const weighted = scores.reduce((sum, s) => sum + s.weightedScore, 0);
  return clampScore(weighted / totalWeight);
}

export function criteriaForKind(
  rubric: JudgeContext["rubric"],
  kind: JudgeKind
): EvaluationCriterion[] {
  return rubric.criteria.filter((c) => c.kind === kind);
}

export abstract class PlaceholderJudge implements IJudge {
  abstract readonly kind: JudgeKind;
  abstract readonly judgeId: string;

  protected abstract evaluateCriterion(
    criterion: EvaluationCriterion,
    context: JudgeContext
  ): { rawScore: number; notes?: string; findings?: EvaluationFinding[] };

  async evaluate(context: JudgeContext): Promise<Result<JudgeResult>> {
    const criteria = criteriaForKind(context.rubric, this.kind);
    const scores: JudgeScore[] = [];
    const findings: EvaluationFinding[] = [];

    for (const criterion of criteria) {
      const result = this.evaluateCriterion(criterion, context);
      scores.push(buildJudgeScore(criterion, result.rawScore, result.notes));
      if (result.findings?.length) {
        findings.push(...result.findings);
      }
    }

    const aggregateScore = aggregateJudgeScores(scores);
    const passed =
      scores.length === 0 ||
      scores.every((s) => !criteria.find((c) => c.id === s.criterionId)?.required || s.passed);

    return success({
      judgeId: this.judgeId,
      kind: this.kind,
      scores,
      aggregateScore,
      passed,
      findings,
      evaluatedAt: new Date().toISOString(),
    });
  }
}

export function hasOutputKey(
  output: Readonly<Record<string, unknown>> | undefined,
  key: string
): boolean {
  return Boolean(output && Object.prototype.hasOwnProperty.call(output, key));
}

export function outputText(output: Readonly<Record<string, unknown>> | undefined): string {
  if (!output) return "";
  const message = output.message;
  if (typeof message === "string") return message;
  const text = output.text;
  if (typeof text === "string") return text;
  return JSON.stringify(output);
}
