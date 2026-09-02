/**
 * SpecGuard — deterministic specification / output-contract compliance.
 * Step 2: executes effective Output Contract validation when service/subtype available.
 */

import type { IOutputContractRegistry } from "../../contracts/layer-ports";
import { defaultOutputContractRegistry } from "../../contracts/output-contract-registry";
import type {
  EvaluateOutputInput,
  EvaluationFinding,
  EvaluationOutcome,
  EvaluationResult,
  IEvaluator,
} from "../contracts/evaluation-result";
import { OS_EVALUATION_VERSION } from "../contracts/evaluation-result";
import {
  validateOutputContract,
  gateStatusToEvaluationOutcome,
  buildRepairInfo,
  type OutputValidationResult,
} from "../output-validation";

export const SPEC_GUARD_EVALUATOR_ID = "spec_guard" as const;
export const SPEC_GUARD_VERSION = "1.2.0" as const;

const MOCKUP_KINDS = new Set(["image_mockup", "image_3d_mockup"]);

function findingsFromValidation(
  validation: OutputValidationResult,
): EvaluationFinding[] {
  const findings: EvaluationFinding[] = [];

  for (const req of validation.requirements) {
    if (req.status === "PASS") continue;
    const code =
      req.status === "FAIL"
        ? "SPEC_CONTRACT_REQ_FAIL"
        : req.status === "UNVERIFIED"
          ? "SPEC_CONTRACT_UNVERIFIED"
          : "SPEC_CONTRACT_NOT_AUTOMATED";
    findings.push({
      code,
      message: `[${req.requirementId}] ${req.description}: ${req.status} — ${req.evidence.join("; ") || req.expectedValue}`,
      severity:
        req.status === "FAIL" && req.blocksCompletion
          ? req.severity === "critical"
            ? "critical"
            : "error"
          : req.status === "UNVERIFIED" && req.blocksCompletion
            ? "error"
            : "warning",
      field: req.requirementId,
    });
  }

  if (validation.status === "BLOCKED") {
    findings.push({
      code: "SPEC_QUALITY_GATE_BLOCKED",
      message: `Quality gate BLOCKED — mandatory requirement failure`,
      severity: "critical",
    });
  } else if (validation.status === "FAIL") {
    findings.push({
      code: "SPEC_QUALITY_GATE_FAIL",
      message: `Quality gate FAIL — ${validation.provenance.find((p) => p.field === "gateReason")?.value ?? "requirements not met"}`,
      severity: "error",
    });
  } else if (validation.status === "NEEDS_REVISION") {
    findings.push({
      code: "SPEC_QUALITY_GATE_NEEDS_REVISION",
      message: `Quality gate NEEDS_REVISION — score ${validation.overallScore}`,
      severity: "warning",
    });
  }

  return findings;
}

export class SpecGuardEvaluator implements IEvaluator {
  readonly evaluatorId = SPEC_GUARD_EVALUATOR_ID;
  readonly category = "specification" as const;
  readonly evaluatorVersion = SPEC_GUARD_VERSION;

  constructor(
    private readonly contracts: IOutputContractRegistry = defaultOutputContractRegistry,
  ) {}

  evaluate(input: EvaluateOutputInput): EvaluationResult {
    const nowIso = input.nowIso ?? (() => new Date().toISOString());
    const createId = input.createId ?? ((p: string) => `${p}_${Date.now()}`);
    const findings: EvaluationFinding[] = [];
    let specScore = 1;
    let validationResult: OutputValidationResult | undefined;

    const contract = this.contracts.getContract(input.outputContractId);
    if (!contract || contract.status === "not_implemented") {
      // Only warn if no service-level contract will run
      if (!input.service || !input.subtype) {
        findings.push({
          code: "SPEC_MISSING_CONTRACT",
          message: `Output contract missing or not implemented: ${input.outputContractId}`,
          severity: "error",
        });
        specScore = 0;
      }
    }

    const preview = (input.preview ?? "").trim();
    if (!preview) {
      findings.push({
        code: "SPEC_EMPTY_OUTPUT",
        message: "Output preview is empty",
        severity: "error",
        field: "preview",
      });
      specScore = Math.min(specScore, 0);
    }

    const sections = input.requiredSections ?? [];
    for (const section of sections) {
      const re = new RegExp(section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      if (preview && !re.test(preview)) {
        findings.push({
          code: "SPEC_MISSING_SECTION",
          message: `Required section/signal not found: ${section}`,
          severity: "warning",
          field: section,
        });
        specScore = Math.min(specScore, 0.85);
      }
    }

    if (
      sections.some((s) => /cta/i.test(s)) &&
      preview &&
      !/\b(cta|call to action|shop now|buy now|learn more|get started|sign up)\b/i.test(
        preview,
      )
    ) {
      findings.push({
        code: "SPEC_MISSING_CTA",
        message: "CTA signal not detected in landing page output",
        severity: "warning",
        field: "CTA",
      });
      specScore = Math.min(specScore, 0.8);
    }

    const outputKind = (input.outputKind ?? "").trim().toLowerCase();
    const mockupRole = (input.mockupRole ?? "").trim().toLowerCase();
    if (outputKind && mockupRole) {
      const kindIsMockup = MOCKUP_KINDS.has(outputKind);
      if (mockupRole === "primary" && !kindIsMockup) {
        findings.push({
          code: "SPEC_MOCKUP_ROLE_KIND_MISMATCH",
          message: `mockupRole=primary requires image_mockup|image_3d_mockup, got ${outputKind}`,
          severity: "error",
          field: "outputKind",
        });
        specScore = Math.min(specScore, 0.2);
      }
      if (kindIsMockup && mockupRole !== "primary") {
        findings.push({
          code: "SPEC_MOCKUP_ROLE_KIND_MISMATCH",
          message: `kind=${outputKind} requires mockupRole=primary, got ${mockupRole}`,
          severity: "error",
          field: "mockupRole",
        });
        specScore = Math.min(specScore, 0.2);
      }
      if (
        (mockupRole === "prohibited" || mockupRole === "optional") &&
        kindIsMockup
      ) {
        findings.push({
          code: "SPEC_PRIMARY_REPLACED_BY_MOCKUP",
          message:
            "Primary deliverable kind must not be a mockup kind when mockupRole is prohibited or optional",
          severity: "error",
          field: "outputKind",
        });
        specScore = Math.min(specScore, 0.2);
      }
    }

    if (
      input.expectedAspectRatio &&
      input.actualAspectRatio &&
      input.expectedAspectRatio.trim() !== input.actualAspectRatio.trim()
    ) {
      findings.push({
        code: "SPEC_ASPECT_RATIO_MISMATCH",
        message: `Expected aspect ratio ${input.expectedAspectRatio}, got ${input.actualAspectRatio}`,
        severity: "warning",
        field: "aspectRatio",
      });
      specScore = Math.min(specScore, 0.85);
    }

    if (
      input.expectedModalities?.length &&
      input.actualModality &&
      !input.expectedModalities
        .map((m) => m.toLowerCase())
        .includes(input.actualModality.toLowerCase())
    ) {
      findings.push({
        code: "SPEC_MODALITY_MISMATCH",
        message: `Expected modality in [${input.expectedModalities.join(", ")}], got ${input.actualModality}`,
        severity: "warning",
        field: "modality",
      });
      specScore = Math.min(specScore, 0.85);
    }

    // Step 2 — execute effective Output Contract validation
    if (input.service && input.subtype) {
      validationResult = validateOutputContract({
        organizationId: input.organizationId,
        executionId: input.executionId,
        service: input.service,
        subtype: input.subtype,
        platform: input.platform,
        format: input.format,
        industry: input.industry,
        preview: input.preview,
        briefObjective: input.briefObjective ?? input.objective,
        structuredData: input.structuredData,
        mediaArtifactIds: input.mediaArtifactIds,
        outputKind: input.outputKind,
        mockupRole: input.mockupRole,
        expectedAspectRatio: input.expectedAspectRatio,
        actualAspectRatio: input.actualAspectRatio,
        actualModality: input.actualModality,
        brandAvoidTerms: input.brandAvoidTerms,
        brandPreferredTerms: input.brandPreferredTerms,
        boundLogoAssetId: input.boundLogoAssetId,
        brandVoice: input.brandVoice,
        buildSucceeded: input.buildSucceeded,
        buildOutput: input.buildOutput,
        runtimeErrors: input.runtimeErrors,
        nowIso,
        createId,
      });

      if (validationResult) {
        findings.push(...findingsFromValidation(validationResult));
        const passRatio =
          validationResult.hardRequirementSummary.total > 0
            ? validationResult.hardRequirementSummary.passed /
              validationResult.hardRequirementSummary.total
            : 1;
        specScore = Math.min(specScore, passRatio);
        if (!validationResult.completionAllowed) {
          specScore = Math.min(specScore, 0.1);
        }
      }
    }

    const errors = findings.filter(
      (f) => f.severity === "error" || f.severity === "critical",
    );
    const warnings = findings.filter((f) => f.severity === "warning");

    let outcome: EvaluationOutcome;
    if (validationResult) {
      outcome = gateStatusToEvaluationOutcome(validationResult.status);
      if (errors.length > 0 && outcome === "PASS") {
        outcome = "RETRY_REQUIRED";
      }
    } else {
      outcome =
        errors.length > 0
          ? "RETRY_REQUIRED"
          : warnings.length > 0
            ? "PASS_WITH_WARNINGS"
            : "PASS";
    }

    const repairInfo = validationResult
      ? buildRepairInfo(validationResult.requirements)
      : [];

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
        specComplianceScore: specScore,
        overallScore: specScore,
        qualityScore: validationResult
          ? validationResult.overallScore / 100
          : undefined,
      },
      findings,
      severity: errors.length
        ? "error"
        : warnings.length
          ? "warning"
          : "info",
      confidence: validationResult ? 0.95 : 0.9,
      provenance: [
        {
          field: "outputContractId",
          value: input.outputContractId,
          source: "SYSTEM_RULE",
        },
        ...(validationResult
          ? [
              {
                field: "effectiveContractId",
                value:
                  validationResult.effectiveContractId ??
                  validationResult.contractId,
                source: "SYSTEM_RULE" as const,
              },
              {
                field: "contractVersion",
                value: validationResult.contractVersion,
                source: "SYSTEM_RULE" as const,
              },
              {
                field: "validationStatus",
                value: validationResult.status,
                source: "SYSTEM_RULE" as const,
              },
              {
                field: "completionAllowed",
                value: String(validationResult.completionAllowed),
                source: "SYSTEM_RULE" as const,
              },
              ...(repairInfo.length
                ? [
                    {
                      field: "repairInfoCount",
                      value: String(repairInfo.length),
                      source: "SYSTEM_RULE" as const,
                    },
                  ]
                : []),
            ]
          : []),
        ...(outputKind
          ? [{ field: "outputKind", value: outputKind, source: "SYSTEM_RULE" as const }]
          : []),
        ...(mockupRole
          ? [{ field: "mockupRole", value: mockupRole, source: "SYSTEM_RULE" as const }]
          : []),
      ],
    };
  }
}
