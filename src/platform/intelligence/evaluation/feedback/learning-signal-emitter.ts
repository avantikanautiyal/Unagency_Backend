/**
 * Learning signals emitted by evaluation (evaluation never learns itself).
 */

import { success, type Result } from "../../shared/result";
import type { EvaluationLearningSignal } from "../contracts/dynamic-evaluation";
import type { IEvaluationLearningSignalEmitter } from "../interfaces/dynamic-evaluation-ports";

export class DefaultEvaluationLearningSignalEmitter
  implements IEvaluationLearningSignalEmitter
{
  emit(input: Parameters<IEvaluationLearningSignalEmitter["emit"]>[0]): Result<readonly EvaluationLearningSignal[]> {
    const signals: EvaluationLearningSignal[] = [
      {
        signalId: `ls_coverage_${input.strategy.pipelineFamily}`,
        kind: "coverage_gap",
        strength: Math.min(1, input.plan.selectedJudges.length / 8),
        message: `Pipeline ${input.strategy.pipelineFamily} used ${input.plan.selectedJudges.length} judges.`,
      },
      {
        signalId: `ls_score_${input.strategy.strategyId}`,
        kind: "judge_performance",
        strength: input.overallScore,
        message: `Overall score ${input.overallScore.toFixed(3)}; passed=${input.evaluationPassed}.`,
      },
    ];

    if (!input.evaluationPassed) {
      signals.push({
        signalId: `ls_risk_${input.strategy.strategyId}`,
        kind: "risk_miss",
        strength: 0.8,
        message: `Evaluation failed under risk=${input.strategy.riskLevel}.`,
      });
    }

    if (input.plan.humanReviewRequired) {
      signals.push({
        signalId: `ls_human_${input.strategy.strategyId}`,
        kind: "human_override",
        strength: 0.6,
        message: "Human review required — capture overrides for Learning.",
        relatedJudgeKind: "human",
      });
    }

    for (const w of input.weights.entries.slice(0, 3)) {
      signals.push({
        signalId: `ls_weight_${w.kind}`,
        kind: "weight_effectiveness",
        strength: w.weight,
        message: `Weight ${w.weight.toFixed(3)} assigned to ${w.kind}.`,
        relatedJudgeKind: w.kind,
      });
    }

    return success(signals);
  }
}
