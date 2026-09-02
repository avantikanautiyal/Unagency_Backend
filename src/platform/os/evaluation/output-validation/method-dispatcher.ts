/**
 * Evaluation method dispatcher — routes contract requirements to validators.
 */

import type { ContractRequirement } from "../../contracts/output-contracts/evaluation-methods";
import type { EvaluationMethod } from "../../contracts/output-contracts/evaluation-methods";
import type { EffectiveOutputContract } from "../../contracts/output-contracts/types";
import type { RequirementValidationResult } from "./validation-result";
import type { ValidationArtifactContext } from "./artifact-context";
import {
  validateDeterministic,
  validateBuildTestExecution,
  validateRuntimeValidation,
  validateStaticAnalysis,
  validateAccessibilityTooling,
  validatePerformanceTooling,
  validateHumanApproval,
  validateNotYetAutomated,
} from "./validators/deterministic-validator";
import { validateArtifactInspection } from "./validators/artifact-inspector";
import { validateSchema } from "./validators/schema-validator";
import { validateSemanticRequirement } from "./validators/semantic-evaluator";
import { validateVisualRequirement } from "./validators/visual-evaluator";

export function dispatchRequirementValidation(input: {
  readonly requirement: ContractRequirement;
  readonly ctx: ValidationArtifactContext;
  readonly contract: EffectiveOutputContract;
  readonly briefObjective?: string;
}): RequirementValidationResult {
  const { requirement: req, ctx, contract, briefObjective } = input;
  const method: EvaluationMethod = req.evaluation.method;

  switch (method) {
    case "deterministic_validation":
      return validateDeterministic(req, ctx);
    case "artifact_inspection":
      return validateArtifactInspection(req, ctx, contract.outputKind);
    case "schema_validation":
      return validateSchema(req, ctx, contract);
    case "build_test_execution":
      return validateBuildTestExecution(req, ctx);
    case "runtime_validation":
      return validateRuntimeValidation(req, ctx);
    case "static_analysis":
      return validateStaticAnalysis(req, ctx);
    case "accessibility_tooling":
      return validateAccessibilityTooling(req, ctx);
    case "performance_tooling":
      return validatePerformanceTooling(req, ctx);
    case "semantic_evaluator":
      return validateSemanticRequirement(req, ctx, briefObjective);
    case "visual_evaluator":
      return validateVisualRequirement(req, ctx);
    case "human_approval":
      return validateHumanApproval(req);
    case "not_yet_automated":
      return validateNotYetAutomated(req);
    default:
      return validateNotYetAutomated(req);
  }
}

/** Map evaluation methods to automation tier for coverage audit. */
export function methodAutomationTier(
  method: EvaluationMethod,
): "executable" | "partial" | "not_automated" {
  switch (method) {
    case "deterministic_validation":
    case "artifact_inspection":
    case "schema_validation":
      return "executable";
    case "semantic_evaluator":
      return "partial";
    case "build_test_execution":
    case "runtime_validation":
    case "static_analysis":
      return "partial";
    case "visual_evaluator":
    case "accessibility_tooling":
    case "performance_tooling":
    case "human_approval":
    case "not_yet_automated":
      return "not_automated";
    default:
      return "not_automated";
  }
}
