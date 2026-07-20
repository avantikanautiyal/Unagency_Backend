/**
 * Build EvaluationRubric from dynamic weight profile.
 */

import type { EvaluationRubric } from "../contracts/evaluation-models";
import type { JudgeWeightProfile } from "../contracts/dynamic-evaluation";

export function buildDynamicRubric(
  family: string,
  weights: JudgeWeightProfile,
  passingScore: number
): EvaluationRubric {
  return {
    id: `rubric_dynamic_${family}`,
    name: `Dynamic ${family} Rubric`,
    version: "1.0.0",
    passingScore,
    criteria: weights.entries.map((e) => ({
      id: `crit_${e.kind}`,
      name: `${e.kind} criterion`,
      description: e.rationale,
      kind: e.kind,
      weight: e.weight,
      threshold: e.threshold,
      required: e.required,
    })),
    metadata: {
      dynamic: true,
      weightProfileId: weights.profileId,
    },
  };
}
