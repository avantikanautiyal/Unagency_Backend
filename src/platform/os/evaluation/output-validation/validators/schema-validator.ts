/**
 * Schema validation — validate structured output against declared schemas.
 */

import type { ContractRequirement } from "../../../contracts/output-contracts/evaluation-methods";
import type { EffectiveOutputContract } from "../../../contracts/output-contracts/types";
import type { RequirementValidationResult } from "../validation-result";
import type { ValidationArtifactContext } from "../artifact-context";
import { previewIsEmpty, structuredHasKey } from "../artifact-context";
import { OUTPUT_VALIDATION_VERSION } from "../validation-result";

const VALIDATOR_VERSION = `schema_validation.${OUTPUT_VALIDATION_VERSION}`;

const SCHEMA_REQUIRED_KEYS: Readonly<Record<string, readonly string[]>> =
  Object.freeze({
    WebProject: ["stack", "files"],
    DocumentPlan: ["sections"],
    PresentationRoutes: ["decks"],
    EmailPlan: ["subject", "sections"],
    PresentationPlan: ["slides"],
  });

function result(
  req: ContractRequirement,
  status: RequirementValidationResult["status"],
  actualValue: string | undefined,
  evidence: string[],
  repairGuidance?: string,
): RequirementValidationResult {
  return Object.freeze({
    requirementId: req.id,
    category: req.category,
    description: req.description,
    evaluationMethod: req.evaluation.method,
    status,
    actualValue,
    expectedValue: req.evaluation.expectedResult,
    severity: req.evaluation.severity,
    blocksCompletion: req.evaluation.blocksCompletion,
    optional: req.optional,
    evidence: Object.freeze(evidence),
    validatorVersion: VALIDATOR_VERSION,
    repairGuidance,
    failureCategory: status === "FAIL" ? "invalid_output_format" : undefined,
  });
}

export function validateSchema(
  req: ContractRequirement,
  ctx: ValidationArtifactContext,
  contract?: EffectiveOutputContract,
): RequirementValidationResult {
  const schemaRef =
    contract?.structuredSchemaRef ??
    req.evaluation.expectedResult.match(/(\w+) schema/i)?.[1];

  if (!ctx.structuredDataParsed || previewIsEmpty(ctx)) {
    if (req.evaluation.blocksCompletion) {
      return result(
        req,
        "FAIL",
        "no structured data",
        ["structured output missing or empty preview"],
        "Produce valid structured output matching schema",
      );
    }
    return result(req, "UNVERIFIED", undefined, ["no structured data to validate"]);
  }

  const schemaName = schemaRef ?? inferSchemaName(contract?.outputKind);
  if (!schemaName) {
    return result(req, "UNVERIFIED", undefined, ["schema name not inferrable"]);
  }

  const requiredKeys = SCHEMA_REQUIRED_KEYS[schemaName];
  if (!requiredKeys) {
    // Generic object validation
    if (typeof ctx.structuredDataParsed === "object" && !Array.isArray(ctx.structuredDataParsed)) {
      const keys = Object.keys(ctx.structuredDataParsed);
      if (keys.length >= 2) {
        return result(req, "PASS", schemaName, [`structured object with keys: ${keys.join(", ")}`]);
      }
    }
    return result(req, "UNVERIFIED", undefined, [
      `no key requirements defined for schema ${schemaName}`,
    ]);
  }

  const missing = requiredKeys.filter(
    (k) => !structuredHasKey(ctx, k) && !(k in (ctx.structuredDataParsed as object)),
  );
  if (missing.length === 0) {
    return result(req, "PASS", schemaName, [
      `schema ${schemaName} required keys present: ${requiredKeys.join(", ")}`,
    ]);
  }
  return result(
    req,
    "FAIL",
    `missing: ${missing.join(", ")}`,
    [`schema ${schemaName} missing keys: ${missing.join(", ")}`],
    `Add required ${schemaName} fields: ${missing.join(", ")}`,
  );
}

function inferSchemaName(outputKind?: string): string | undefined {
  switch ((outputKind ?? "").toLowerCase()) {
    case "deferred_website":
      return "WebProject";
    case "document":
      return "DocumentPlan";
    case "presentation":
      return "PresentationRoutes";
    case "email":
      return "EmailPlan";
    default:
      return undefined;
  }
}
