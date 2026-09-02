/**
 * Deterministic validators — establish truth without LLM evaluation.
 */

import type { ContractRequirement } from "../../../contracts/output-contracts/evaluation-methods";
import type { RequirementValidationResult } from "../validation-result";
import type { ValidationArtifactContext } from "../artifact-context";
import {
  hasMediaArtifact,
  hasPlaceholderContent,
  previewIsEmpty,
  structuredArrayLength,
  structuredHasKey,
} from "../artifact-context";
import { OUTPUT_VALIDATION_VERSION } from "../validation-result";

const VALIDATOR_VERSION = `deterministic.${OUTPUT_VALIDATION_VERSION}`;

const MOCKUP_KINDS = new Set(["image_mockup", "image_3d_mockup"]);

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
    failureCategory:
      status === "FAIL" ? ("critical_validation_failure" as const) : undefined,
  });
}

export function validateDeterministic(
  req: ContractRequirement,
  ctx: ValidationArtifactContext,
): RequirementValidationResult {
  const id = req.id;

  if (id === "hard.non_empty_output" || id.endsWith(".non_empty")) {
    if (previewIsEmpty(ctx) && !hasMediaArtifact(ctx)) {
      return result(req, "FAIL", "empty", ["preview empty and no media artifacts"]);
    }
    return result(req, "PASS", "non-empty", ["preview or media artifact present"]);
  }

  if (id === "hard.no_placeholder_only") {
    if (hasPlaceholderContent(ctx)) {
      return result(
        req,
        "FAIL",
        "placeholder detected",
        ["placeholder pattern in preview"],
        "Replace placeholder content with production copy",
      );
    }
    return result(req, "PASS", "no placeholders", ["no placeholder patterns"]);
  }

  if (id === "hard.mockup_role_consistency") {
    const kind = (ctx.outputKind ?? "").toLowerCase();
    const role = (ctx.mockupRole ?? "").toLowerCase();
    if (kind && role) {
      const kindIsMockup = MOCKUP_KINDS.has(kind);
      if (role === "primary" && !kindIsMockup) {
        return result(req, "FAIL", `kind=${kind}`, ["mockupRole=primary but kind is not mockup"]);
      }
      if (kindIsMockup && role !== "primary") {
        return result(req, "FAIL", `role=${role}`, ["mockup kind requires mockupRole=primary"]);
      }
    }
    return result(req, "PASS", "consistent", ["kind/mockupRole consistent or not applicable"]);
  }

  if (id === "hard.dynamic_modality_resolved") {
    if ((ctx.outputKind ?? "").toLowerCase() === "dynamic") {
      return result(
        req,
        "FAIL",
        "dynamic",
        ["output kind still dynamic"],
        "Resolve output type before execution completes",
      );
    }
    return result(req, "PASS", ctx.outputKind ?? "resolved", ["output kind resolved"]);
  }

  if (id.includes("aspect_ratio")) {
    if (ctx.expectedAspectRatio && ctx.actualAspectRatio) {
      if (ctx.expectedAspectRatio !== ctx.actualAspectRatio) {
        return result(
          req,
          "FAIL",
          ctx.actualAspectRatio,
          [`expected ${ctx.expectedAspectRatio}, got ${ctx.actualAspectRatio}`],
        );
      }
      return result(req, "PASS", ctx.actualAspectRatio, ["aspect ratio matches"]);
    }
    if (ctx.expectedAspectRatio && !ctx.actualAspectRatio) {
      return result(req, "UNVERIFIED", undefined, [
        "expected aspect ratio declared but actual not available for inspection",
      ]);
    }
    return result(req, "PASS", "n/a", ["aspect ratio check not applicable"]);
  }

  if (id === "hard.deliverable_format_valid") {
    if (hasMediaArtifact(ctx) || !previewIsEmpty(ctx)) {
      return result(req, "PASS", "deliverable present", ["artifact or preview exists"]);
    }
    return result(req, "FAIL", "missing", ["no deliverable artifact or preview"]);
  }

  // Default: inspect requirement id for known patterns
  if (req.description.toLowerCase().includes("empty") && previewIsEmpty(ctx)) {
    return result(req, "FAIL", "empty", ["content empty"]);
  }

  return result(req, "UNVERIFIED", undefined, [
    `deterministic check not implemented for requirement ${id}`,
  ]);
}

export function validateBuildTestExecution(
  req: ContractRequirement,
  ctx: ValidationArtifactContext,
): RequirementValidationResult {
  if (ctx.buildSucceeded === true) {
    return result(req, "PASS", "build succeeded", [
      ctx.buildOutput ?? "build completed successfully",
    ]);
  }
  if (ctx.buildSucceeded === false) {
    return result(
      req,
      "FAIL",
      "build failed",
      [ctx.buildOutput ?? "build failed"],
      "Fix build errors before completion",
    );
  }
  // No build was run — honest unverified, not fake pass
  return result(req, "NOT_AUTOMATED", undefined, [
    "build/test execution not available at validation time — requires project artifact on disk",
  ]);
}

export function validateRuntimeValidation(
  req: ContractRequirement,
  ctx: ValidationArtifactContext,
): RequirementValidationResult {
  if (ctx.runtimeErrors?.length) {
    const critical = ctx.runtimeErrors.filter((e) =>
      /error|exception|failed/i.test(e),
    );
    if (critical.length) {
      return result(req, "FAIL", "runtime errors", critical);
    }
  }
  if (ctx.runtimeErrors && ctx.runtimeErrors.length === 0) {
    return result(req, "PASS", "no errors", ["no runtime errors reported"]);
  }
  return result(req, "NOT_AUTOMATED", undefined, [
    "runtime validation requires live preview execution — not available in this validation context",
  ]);
}

export function validateStaticAnalysis(
  req: ContractRequirement,
  ctx: ValidationArtifactContext,
): RequirementValidationResult {
  const seo = ctx.artifactEvaluation?.seo;
  if (req.id.includes("seo") || req.category === "seo") {
    if (seo?.evaluated) {
      const failed = seo.findings.filter((f) => !f.passed);
      if (failed.length === 0) {
        return result(req, "PASS", `seo score=${seo.score}`, [...seo.evidence]);
      }
      return result(
        req,
        "FAIL",
        `seo score=${seo.score}`,
        failed.map((f) => `${f.checkId}: ${f.detail}`),
      );
    }
    const hasMeta =
      /<meta\s/i.test(ctx.preview) ||
      structuredHasKey(ctx, "seo", "meta", "metaTags");
    if (hasMeta) {
      return result(req, "PASS", "seo signals present", ["meta/seo content detected"]);
    }
    if (!previewIsEmpty(ctx)) {
      return result(req, "UNVERIFIED", undefined, [
        "SEO static analysis requires full HTML artifact — partial preview only",
      ]);
    }
  }
  return result(req, "NOT_AUTOMATED", undefined, [
    "static analysis tooling not wired in Step 2 validation context",
  ]);
}

export function validateAccessibilityTooling(
  req: ContractRequirement,
  ctx: ValidationArtifactContext,
): RequirementValidationResult {
  const a11y = ctx.artifactEvaluation?.accessibility;
  if (a11y?.evaluated) {
    if (a11y.criticalCount > 0) {
      return result(
        req,
        "FAIL",
        `score=${a11y.score}`,
        a11y.violations.map((v) => `[${v.impact}] ${v.description}`),
      );
    }
    if (a11y.violationCount > 0) {
      return result(
        req,
        "UNVERIFIED",
        `score=${a11y.score}`,
        [...a11y.evidence, ...a11y.violations.map((v) => v.description)],
      );
    }
    return result(req, "PASS", `score=${a11y.score}`, [...a11y.evidence]);
  }
  return result(req, "NOT_AUTOMATED", undefined, [
    "accessibility tooling not executed on artifact — explicit NOT_AUTOMATED",
  ]);
}

export function validatePerformanceTooling(
  req: ContractRequirement,
  ctx: ValidationArtifactContext,
): RequirementValidationResult {
  const perf = ctx.artifactEvaluation?.performance;
  if (perf?.evaluated) {
    const pass = perf.score >= (req.evaluation.threshold ?? 60);
    return result(
      req,
      pass ? "PASS" : "FAIL",
      `score=${perf.score}`,
      [...perf.evidence],
    );
  }
  return result(req, "NOT_AUTOMATED", undefined, [
    "performance measurement not executed — explicit NOT_AUTOMATED",
  ]);
}

export function validateHumanApproval(
  req: ContractRequirement,
): RequirementValidationResult {
  return result(req, "NOT_AUTOMATED", undefined, [
    "human approval required — not yet recorded",
  ]);
}

export function validateNotYetAutomated(
  req: ContractRequirement,
): RequirementValidationResult {
  return result(req, "NOT_AUTOMATED", undefined, [
    "requirement marked not_yet_automated in contract",
  ]);
}
