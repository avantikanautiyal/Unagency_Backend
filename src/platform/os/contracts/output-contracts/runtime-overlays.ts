/**
 * Runtime brand and user/task requirement builders.
 * Canonical service contracts remain controlled by UnAgency; these are overlays only.
 */

import type { ContractRequirement } from "./evaluation-methods";

export function brandRequirementsFromContext(input: {
  readonly avoidTerms?: readonly string[];
  readonly preferredTerms?: readonly string[];
  readonly colors?: readonly string[];
  readonly logoAssetId?: string;
  readonly voice?: string;
}): readonly ContractRequirement[] {
  const reqs: ContractRequirement[] = [];

  if (input.avoidTerms?.length) {
    reqs.push({
      id: "brand.avoid_terms",
      class: "hard",
      category: "brand",
      description: `Must not use prohibited terms: ${input.avoidTerms.join(", ")}`,
      evaluation: {
        method: "deterministic_validation",
        expectedResult: "no prohibited terms in output",
        severity: "high",
        blocksCompletion: false,
      },
    });
  }

  if (input.preferredTerms?.length) {
    reqs.push({
      id: "brand.preferred_terms",
      class: "hard",
      category: "brand",
      description: `Should use preferred brand terms where appropriate`,
      evaluation: {
        method: "semantic_evaluator",
        expectedResult: `preferred terms reflected: ${input.preferredTerms.join(", ")}`,
        severity: "medium",
        blocksCompletion: false,
      },
      optional: true,
    });
  }

  if (input.colors?.length) {
    reqs.push({
      id: "brand.colors",
      class: "hard",
      category: "brand",
      description: `Brand colors should be used: ${input.colors.join(", ")}`,
      evaluation: {
        method: "visual_evaluator",
        expectedResult: "brand colors present in visual output",
        severity: "medium",
        blocksCompletion: false,
      },
      optional: true,
    });
  }

  if (input.logoAssetId) {
    reqs.push({
      id: "brand.logo_asset",
      class: "hard",
      category: "brand",
      description: "Bound brand logo asset must be used where logo is required",
      evaluation: {
        method: "artifact_inspection",
        expectedResult: `logo asset ${input.logoAssetId} referenced or embedded`,
        severity: "high",
        blocksCompletion: false,
      },
    });
  }

  if (input.voice?.trim()) {
    reqs.push({
      id: "brand.voice",
      class: "hard",
      category: "brand",
      description: `Brand voice: ${input.voice}`,
      evaluation: {
        method: "semantic_evaluator",
        expectedResult: "output matches brand voice",
        severity: "medium",
        blocksCompletion: false,
      },
      optional: true,
    });
  }

  return Object.freeze(reqs);
}

export function userTaskRequirementsFromBrief(input: {
  readonly prompt?: string;
  readonly constraints?: readonly string[];
  readonly platform?: string;
  readonly format?: string;
}): readonly ContractRequirement[] {
  const reqs: ContractRequirement[] = [];

  if (input.prompt?.trim()) {
    reqs.push({
      id: "user_task.brief_objective",
      class: "hard",
      category: "user_task",
      description: "Output must satisfy the user brief objective",
      evaluation: {
        method: "semantic_evaluator",
        expectedResult: "brief objective satisfied",
        severity: "high",
        blocksCompletion: false,
      },
    });
  }

  for (const constraint of input.constraints ?? []) {
    if (!constraint.trim()) continue;
    reqs.push({
      id: `user_task.constraint.${constraint.slice(0, 32).replace(/\W+/g, "_")}`,
      class: "hard",
      category: "user_task",
      description: `User constraint: ${constraint}`,
      evaluation: {
        method: "semantic_evaluator",
        expectedResult: constraint,
        severity: "high",
        blocksCompletion: false,
      },
    });
  }

  return Object.freeze(reqs);
}
