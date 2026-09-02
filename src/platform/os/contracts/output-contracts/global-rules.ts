/**
 * Global output contract rules applied to every UnAgency service.
 */

import type { ContractRequirement, QualityDimension } from "./evaluation-methods";
import { OUTPUT_CONTRACT_GLOBAL_RULES_VERSION } from "./versioning";

export const GLOBAL_OUTPUT_CONTRACT_ID = "global.output_contract_rules" as const;

export const GLOBAL_HARD_REQUIREMENTS: readonly ContractRequirement[] =
  Object.freeze([
    {
      id: "hard.non_empty_output",
      class: "hard",
      category: "deliverable",
      description: "Primary output must not be empty",
      evaluation: {
        method: "deterministic_validation",
        expectedResult: "preview or artifact has content",
        severity: "critical",
        blocksCompletion: true,
      },
    },
    {
      id: "hard.deliverable_format_valid",
      class: "hard",
      category: "delivery",
      description: "Deliverable must match contracted output kind and supported download formats",
      evaluation: {
        method: "artifact_inspection",
        expectedResult: "artifact MIME/type matches outputKind",
        severity: "critical",
        blocksCompletion: true,
      },
    },
    {
      id: "hard.no_placeholder_only",
      class: "hard",
      category: "content",
      description: "Output must not consist solely of placeholder or lorem ipsum content",
      evaluation: {
        method: "deterministic_validation",
        expectedResult: "no dominant placeholder patterns",
        severity: "high",
        blocksCompletion: true,
      },
    },
    {
      id: "hard.brief_addressed",
      class: "hard",
      category: "content",
      description: "Output must address the user brief objective",
      evaluation: {
        method: "semantic_evaluator",
        expectedResult: "brief objective reflected in output",
        severity: "high",
        blocksCompletion: false,
      },
    },
  ]);

export const GLOBAL_QUALITY_DIMENSIONS: readonly QualityDimension[] =
  Object.freeze([
    {
      id: "quality.brief_adherence",
      label: "Brief adherence",
      definition: "How well the output satisfies the stated user brief and task constraints",
      scoringRange: { min: 0, max: 100 },
      evaluationMethod: "semantic_evaluator",
      threshold: 70,
      weight: 1.2,
    },
    {
      id: "quality.deliverability",
      label: "Client-ready deliverability",
      definition: "Output is polished and ready for client use without major rework",
      scoringRange: { min: 0, max: 100 },
      evaluationMethod: "semantic_evaluator",
      threshold: 75,
      weight: 1.0,
    },
  ]);

export function globalRulesContractMeta() {
  return {
    contractId: GLOBAL_OUTPUT_CONTRACT_ID,
    version: OUTPUT_CONTRACT_GLOBAL_RULES_VERSION,
  };
}
