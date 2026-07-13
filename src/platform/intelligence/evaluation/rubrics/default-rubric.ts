/**
 * Default evaluation rubric with placeholder criteria for all judge kinds.
 */

import type { EvaluationRubric } from "../contracts/evaluation-models";

export const DEFAULT_EVALUATION_RUBRIC: EvaluationRubric = {
  id: "rubric_default_v1",
  name: "Default Intelligence Evaluation Rubric",
  version: "1.0.0",
  passingScore: 0.7,
  criteria: [
    {
      id: "crit_instruction",
      name: "Instruction Adherence",
      description: "Output follows compiled prompt instructions",
      kind: "instruction",
      weight: 1.2,
      threshold: 0.7,
      required: true,
    },
    {
      id: "crit_brand",
      name: "Brand Alignment",
      description: "Output aligns with brand constraints",
      kind: "brand",
      weight: 1.0,
      threshold: 0.6,
      required: false,
    },
    {
      id: "crit_policy",
      name: "Policy Compliance",
      description: "Output satisfies platform policy constraints",
      kind: "policy",
      weight: 1.1,
      threshold: 0.8,
      required: true,
    },
    {
      id: "crit_schema",
      name: "Schema Conformance",
      description: "Output matches expected structure",
      kind: "schema",
      weight: 1.0,
      threshold: 0.75,
      required: true,
    },
    {
      id: "crit_grammar",
      name: "Grammar Quality",
      description: "Placeholder grammar heuristics",
      kind: "grammar",
      weight: 0.6,
      threshold: 0.5,
      required: false,
    },
    {
      id: "crit_safety",
      name: "Safety",
      description: "Placeholder safety checks",
      kind: "safety",
      weight: 1.3,
      threshold: 0.85,
      required: true,
    },
    {
      id: "crit_factual",
      name: "Factual Consistency",
      description: "Placeholder factual consistency signals",
      kind: "factual",
      weight: 0.9,
      threshold: 0.65,
      required: false,
    },
    {
      id: "crit_hallucination",
      name: "Hallucination Risk",
      description: "Placeholder hallucination risk scoring",
      kind: "hallucination",
      weight: 1.0,
      threshold: 0.7,
      required: true,
    },
    {
      id: "crit_human",
      name: "Human Review Signal",
      description: "Placeholder human review disposition signal",
      kind: "human",
      weight: 0.5,
      threshold: 0.5,
      required: false,
    },
  ],
};

export function resolveRubricById(rubricId: string): EvaluationRubric | undefined {
  if (rubricId === DEFAULT_EVALUATION_RUBRIC.id) {
    return DEFAULT_EVALUATION_RUBRIC;
  }
  return undefined;
}
